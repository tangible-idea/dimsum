-- ============================================================
-- 클리커 키우기 - 초기 스키마 (모든 객체 clicker_ 접두)
-- 모델: 구글 로그인(유저) = 신원 / 기기(ESP32)는 유저 소유물
-- 두 가지 신호 경로:
--   1) 게임 클릭 : ESP32(BLE 키보드) → 폰 → 브라우저 keydown → 직접 broadcast
--   2) Poke      : ESP32(WiFi) → poke Edge Function → 친구 기기(폴링)+브라우저(broadcast)
-- 채널: private broadcast 'clicker_feed:<user_id>' (event: click / poke)
-- ============================================================

-- ---------- 공통: updated_at 자동 갱신 ----------
create or replace function public.clicker_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
-- clicker_profiles : auth.users(구글 유저)와 1:1
-- ============================================================
create table public.clicker_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text,
  created_at timestamptz not null default now()
);

-- 구글 가입 시 profiles + game_states 자동 생성
create or replace function public.clicker_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.clicker_profiles (id, nickname)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    )
  );
  insert into public.clicker_game_states (owner_id) values (new.id);
  return new;
end $$;

create trigger clicker_on_auth_user_created
  after insert on auth.users
  for each row execute function public.clicker_handle_new_user();

-- ============================================================
-- clicker_devices : 유저가 소유하는 ESP32
--   device_code   : 물리 기기에 인쇄된 식별자(QR/스티커)
--   device_secret : Poke(WiFi)용 하드웨어 인증키. 등록 시 1회 발급해 펌웨어에 주입
-- ============================================================
create table public.clicker_devices (
  id            uuid primary key default gen_random_uuid(),
  device_code   text not null unique,                       -- URL의 'DSJA-JD49...'
  owner_id      uuid references public.clicker_profiles(id) on delete cascade,
  device_secret uuid not null default gen_random_uuid(),    -- ESP32 Poke 인증 (노출 금지)
  label         text,
  registered    boolean not null default false,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index clicker_devices_owner_idx on public.clicker_devices (owner_id);

-- ============================================================
-- clicker_game_states : 유저 단위 게임 상태
-- ============================================================
create table public.clicker_game_states (
  owner_id     uuid primary key references public.clicker_profiles(id) on delete cascade,
  level        int    not null default 1,
  exp          bigint not null default 0,
  total_clicks bigint not null default 0,
  coins        bigint not null default 0,
  updated_at   timestamptz not null default now()
);
create trigger clicker_game_states_updated_at
  before update on public.clicker_game_states
  for each row execute function public.clicker_set_updated_at();

-- ============================================================
-- clicker_friendships : 유저 ↔ 유저
-- ============================================================
create table public.clicker_friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.clicker_profiles(id) on delete cascade,
  addressee_id uuid not null references public.clicker_profiles(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','accepted','blocked')),
  created_at   timestamptz not null default now(),
  constraint clicker_no_self_friend check (requester_id <> addressee_id)
);
-- 방향 무관 중복 방지 (A→B 와 B→A 동시 존재 금지)
create unique index clicker_friendships_pair_unique
  on public.clicker_friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index clicker_friendships_requester_idx on public.clicker_friendships (requester_id, status);
create index clicker_friendships_addressee_idx on public.clicker_friendships (addressee_id, status);

-- ============================================================
-- clicker_pokes : 유저 → 유저 poke 큐 (오프라인 기기도 켜지면 폴링으로 수신)
--   생성/소비 모두 Edge Function(service_role) 독점 → 클라이언트 정책 없음
-- ============================================================
create table public.clicker_pokes (
  id          bigint generated always as identity primary key,
  from_user   uuid not null references public.clicker_profiles(id) on delete cascade,
  to_user     uuid not null references public.clicker_profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  consumed_at timestamptz                                   -- 기기가 표시 완료한 시각
);
create index clicker_pokes_inbox_idx on public.clicker_pokes (to_user, consumed_at);

-- ============================================================
-- RLS : 기본 차단. 클라이언트가 직접 다뤄야 하는 것만 허용.
--       기기 등록/소유권/poke는 Edge Function(service_role) 독점.
-- ============================================================
alter table public.clicker_profiles    enable row level security;
alter table public.clicker_devices     enable row level security;
alter table public.clicker_game_states enable row level security;
alter table public.clicker_friendships enable row level security;
alter table public.clicker_pokes       enable row level security;  -- 정책 없음 = 클라이언트 차단

-- profiles: 본인 + 수락된 친구
create policy "clicker_profiles: read self and friends"
on public.clicker_profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1 from public.clicker_friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = clicker_profiles.id)
        or (f.addressee_id = auth.uid() and f.requester_id = clicker_profiles.id))
  )
);
create policy "clicker_profiles: update own"
on public.clicker_profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- devices: 본인 소유만 조회 (등록/쓰기는 Edge Function)
create policy "clicker_devices: read own"
on public.clicker_devices for select to authenticated
using (owner_id = auth.uid());

-- game_states: 본인 + 친구(리더보드) 조회 / 본인 진행도 갱신
create policy "clicker_game_states: read self and friends"
on public.clicker_game_states for select to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.clicker_friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = clicker_game_states.owner_id)
        or (f.addressee_id = auth.uid() and f.requester_id = clicker_game_states.owner_id))
  )
);
create policy "clicker_game_states: update own"
on public.clicker_game_states for update to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- friendships: 내가 관련된 행 조회 / 신청 / 수락·차단·삭제
create policy "clicker_friendships: read own"
on public.clicker_friendships for select to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "clicker_friendships: insert as requester"
on public.clicker_friendships for insert to authenticated
with check (requester_id = auth.uid());
create policy "clicker_friendships: update if involved"
on public.clicker_friendships for update to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "clicker_friendships: delete if involved"
on public.clicker_friendships for delete to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ============================================================
-- Realtime Authorization : private broadcast 채널 'clicker_feed:<user_id>'
-- 송신=내 채널만 / 수신=내 채널+수락된 친구 채널
-- 게임 클릭은 브라우저가 직접 송신, poke는 poke 함수가 service_role로 송신
-- ============================================================
alter table realtime.messages enable row level security;

create policy "clicker_broadcast: send to own channel"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and realtime.topic() like 'clicker_feed:%'
  and split_part(realtime.topic(), ':', 2) = auth.uid()::text
);

create policy "clicker_broadcast: read self and accepted friends"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() like 'clicker_feed:%'
  and (
    split_part(realtime.topic(), ':', 2) = auth.uid()::text
    or exists (
      select 1 from public.clicker_friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id::text = split_part(realtime.topic(), ':', 2) and f.addressee_id = auth.uid())
          or
          (f.addressee_id::text = split_part(realtime.topic(), ':', 2) and f.requester_id = auth.uid())
        )
    )
  )
);
