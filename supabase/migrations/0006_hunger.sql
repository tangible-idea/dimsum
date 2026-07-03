-- ============================================================
-- 배고픔 상태 (서버 저장)
--   타이머/크론 없음: {hunger, hunger_fed_at}만 저장하고
--   클라이언트가 '값 - 경과시간 × 감소율'로 지연 계산 (24h에 100 소진)
--   쓰기는 먹일 때 한 번뿐 (RLS: update own 기존 정책 사용)
-- ============================================================
alter table public.clicker_game_states
  add column if not exists hunger int not null default 100
    check (hunger between 0 and 100),
  add column if not exists hunger_fed_at timestamptz not null default now();
