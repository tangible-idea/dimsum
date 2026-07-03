-- ============================================================
-- 주간 랭킹 + 아이템(뽑기권) 스키마
--   주 정의: KST(UTC+9) 월요일 00:00 ~ 다음 월요일 00:00
--   쓰기(랭킹 등록/아이템 지급)는 전부 Edge Function(service_role) 독점
-- ============================================================

-- profiles에 MBTI 저장 (랭킹 등록 시 함께 기록)
alter table public.clicker_profiles add column if not exists mbti text
  check (mbti in ('INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP',
                  'ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'));

-- ============================================================
-- clicker_items : 유저 보유 아이템 (뽑기권 등)
-- ============================================================
create table public.clicker_items (
  owner_id   uuid not null references public.clicker_profiles(id) on delete cascade,
  item_type  text not null check (item_type in ('gacha_rare','gacha_normal')),
  qty        int  not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, item_type)
);
create trigger clicker_items_updated_at
  before update on public.clicker_items
  for each row execute function public.clicker_set_updated_at();

-- 지급 헬퍼(정산 함수에서 사용, upsert 증가)
create or replace function public.clicker_grant_item(p_owner uuid, p_type text, p_qty int)
returns void language sql security definer set search_path = public as $$
  insert into public.clicker_items (owner_id, item_type, qty)
  values (p_owner, p_type, p_qty)
  on conflict (owner_id, item_type)
  do update set qty = clicker_items.qty + excluded.qty;
$$;
revoke execute on function public.clicker_grant_item(uuid, text, int) from public, anon, authenticated;

-- ============================================================
-- clicker_weekly_scores : 주간 랭킹 기록 (유저가 '기록 등록' 시 스냅샷)
--   score는 서버가 clicker_game_states.coins에서 읽음(클라 값 신뢰 안 함)
-- ============================================================
create table public.clicker_weekly_scores (
  week_start date   not null,                 -- KST 기준 월요일
  owner_id   uuid   not null references public.clicker_profiles(id) on delete cascade,
  nickname   text,                            -- 리더보드 표시용 비정규화
  mbti       text   not null,
  score      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (week_start, owner_id)
);
create index clicker_weekly_scores_rank_idx
  on public.clicker_weekly_scores (week_start, score desc, updated_at asc);

-- ============================================================
-- clicker_weekly_awards : 주간 정산 장부(중복 지급 방지)
-- ============================================================
create table public.clicker_weekly_awards (
  week_start   date primary key,
  finalized_at timestamptz not null default now(),
  winners      jsonb not null default '[]'::jsonb
);

-- ============================================================
-- RLS : 조회만 클라이언트 허용, 쓰기는 Edge Function(service_role) 독점
-- ============================================================
alter table public.clicker_items         enable row level security;
alter table public.clicker_weekly_scores enable row level security;
alter table public.clicker_weekly_awards enable row level security;

-- items: 본인 것만 조회
create policy "clicker_items: read own"
on public.clicker_items for select to authenticated
using (owner_id = auth.uid());

-- weekly_scores: 로그인 유저는 리더보드 전체 조회 가능
create policy "clicker_weekly_scores: read all"
on public.clicker_weekly_scores for select to authenticated
using (true);

-- weekly_awards: 결과 공개
create policy "clicker_weekly_awards: read all"
on public.clicker_weekly_awards for select to authenticated
using (true);
