-- ============================================================
-- 데일리 / 위클리 클릭 수 (서버 저장)
--
--   데일리 : KST 자정 00:00 에 0으로
--   위클리 : KST 월요일 00:00 에 0으로 (기존 주간 랭킹과 같은 경계)
--   토탈   : 기존 clicker_game_states.coins 를 그대로 쓴다 — 주간 랭킹
--            (clicker_rank_submit)이 이 값을 점수로 읽으므로 건드리지 않는다.
--            같은 테이블의 total_clicks 는 관리자 화면에서만 쓰는 별개 컬럼이라
--            여기서 손대지 않는다.
--
-- 타이머/크론 없음 — hunger 와 같은 방식이다.
--   '언제 0이 되는가'를 스케줄러로 밀어 넣는 대신 '이 값이 어느 기간의 것인가'를
--   daily_key / week_key 에 같이 저장한다. 읽는 쪽은 키가 지금 기간과 다르면
--   그 값을 0으로 본다. 크론이 안 돌았거나, 그 시각에 아무도 안 켰거나, 기기가
--   꺼져 있었어도 결과가 같다.
--
--   키 계산은 아래 두 함수가 유일한 기준이다. 앱(clicker_stand/lib/services/kst.dart)
--   과 Edge Function(_shared/week.ts)에 같은 규칙이 복제돼 있으니 셋을 함께 고칠 것.
-- ============================================================

alter table public.clicker_game_states
  add column if not exists daily_clicks  bigint not null default 0,
  add column if not exists weekly_clicks bigint not null default 0,
  add column if not exists daily_key     date,
  add column if not exists week_key      date;

comment on column public.clicker_game_states.daily_clicks is
  'KST 하루 클릭 수. daily_key 가 오늘이 아니면 0으로 읽을 것.';
comment on column public.clicker_game_states.weekly_clicks is
  'KST 한 주 클릭 수. week_key 가 이번 주가 아니면 0으로 읽을 것.';

-- 서울은 서머타임이 없어 항상 UTC+9 다.
create or replace function public.clicker_kst_today(t timestamptz default now())
returns date language sql stable as $$
  select (t at time zone 'Asia/Seoul')::date
$$;

-- date_trunc('week', ...) 는 월요일로 내린다 — _shared/week.ts 의 주 정의와 같다.
create or replace function public.clicker_kst_week_start(t timestamptz default now())
returns date language sql stable as $$
  select (date_trunc('week', t at time zone 'Asia/Seoul'))::date
$$;
