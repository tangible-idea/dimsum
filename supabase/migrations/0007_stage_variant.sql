-- ============================================================
-- 성장 단계(50레벨) + 변형(진화 시 2종 중 랜덤) 서버 저장
--   진화할 때마다 클라이언트가 {stage, variant}를 업데이트
--   (RLS: 기존 clicker_game_states 'update own' 정책 사용)
-- ============================================================
alter table public.clicker_game_states
  add column if not exists stage int not null default 0
    check (stage between 0 and 49),
  add column if not exists variant int not null default 0
    check (variant in (0, 1));

-- 기존 유저 백필: 누적 탭 기준 레벨 역산 (레벨 n 문턱 = 250n² + 250n)
update public.clicker_game_states
   set stage = least(49, greatest(0, floor((sqrt(1 + coins / 62.5) - 1) / 2)::int))
 where coins > 0;
