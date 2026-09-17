-- ============================================================
-- 주간 랭킹에서 MBTI 요구를 뗀다
--   앱(clicker_stand)은 탭이 멎으면 자동으로 기록을 올린다. 그 경로에는
--   MBTI 를 물어볼 화면이 없으므로 MBTI 없이도 랭킹에 들어갈 수 있어야 한다.
--   컬럼은 남긴다 — 웹 앱의 MBTI별 랭킹과 기존 기록이 그대로 쓴다.
--
--   번호 주의 — 원래 0006 이었는데 0006_hunger 와 버전이 겹쳤다. supabase 는
--   파일명 앞 숫자를 마이그레이션 '버전'으로 쓰고 그 버전이 이력 테이블의 기본키라,
--   같은 번호 둘은 두 번째에서 중복키로 멎는다. 번호는 파일마다 달라야 한다.
-- ============================================================

alter table public.clicker_weekly_scores alter column mbti drop not null;

-- MBTI별 조회는 이제 값이 있는 행만 훑는다.
create index if not exists clicker_weekly_scores_mbti_idx
  on public.clicker_weekly_scores (week_start, mbti, score desc)
  where mbti is not null;
