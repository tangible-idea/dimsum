// 주간 랭킹 정산 (cron 전용 — 매주 월요일 00:05 KST 권장)
//   header: Authorization: Bearer <SERVICE_ROLE_KEY>  (필수)
//   body: { week_start? }  — 생략 시 '직전 주'를 정산
//
// 동작: 대상 주가 아직 정산 전이면 TOP2를 뽑아
//   1위 → 레어 뽑기권(gacha_rare) x1, 2위 → 일반 뽑기권(gacha_normal) x1 지급
//   clicker_weekly_awards에 기록해 중복 지급 방지
//
// pg_cron 등록 예시(대시보드 SQL):
//   select cron.schedule('clicker_week_finalize', '5 15 * * 0',  -- UTC 일 15:05 = KST 월 00:05
//     $$ select net.http_post(
//          url := 'https://<PROJECT_REF>.supabase.co/functions/v1/clicker_week_finalize',
//          headers := jsonb_build_object('Content-Type','application/json',
//                                        'Authorization','Bearer <SERVICE_ROLE_KEY>'),
//          body := '{}'::jsonb) $$);

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { prevWeekStart, weekStartKst } from "../_shared/week.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REWARDS = [
  { rank: 1, item: "gacha_rare", qty: 1 },
  { rank: 2, item: "gacha_normal", qty: 1 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // service_role 키로만 호출 가능 (유저 JWT 거부)
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (token !== SERVICE_ROLE) return json({ error: "service role required" }, 401);

    const body = await req.json().catch(() => ({}));
    const currentWeek = weekStartKst();
    const target = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.week_start ?? ""))
      ? String(body.week_start)
      : prevWeekStart(currentWeek);

    // 진행 중인 주는 정산 금지
    if (target >= currentWeek) return json({ error: `week ${target} is not finished yet` }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 이미 정산했으면 스킵 (중복 지급 방지)
    const { data: done } = await admin
      .from("clicker_weekly_awards").select("week_start, winners")
      .eq("week_start", target).maybeSingle();
    if (done) return json({ ok: true, already: true, week_start: target, winners: done.winners });

    // TOP 2 (동점은 먼저 등록한 순)
    const { data: top, error: topErr } = await admin
      .from("clicker_weekly_scores")
      .select("owner_id, nickname, mbti, score")
      .eq("week_start", target)
      .order("score", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(REWARDS.length);
    if (topErr) return json({ error: topErr.message }, 500);

    const winners: unknown[] = [];
    for (const [i, row] of (top ?? []).entries()) {
      const r = REWARDS[i];
      const { error: gErr } = await admin.rpc("clicker_grant_item", {
        p_owner: row.owner_id,
        p_type: r.item,
        p_qty: r.qty,
      });
      if (gErr) return json({ error: `grant failed for rank ${r.rank}: ${gErr.message}` }, 500);
      winners.push({ rank: r.rank, owner_id: row.owner_id, nickname: row.nickname, mbti: row.mbti, score: row.score, item: r.item, qty: r.qty });
    }

    const { error: aErr } = await admin
      .from("clicker_weekly_awards")
      .insert({ week_start: target, winners });
    if (aErr) return json({ error: aErr.message }, 500);

    return json({ ok: true, week_start: target, winners });
  } catch (e) {
    console.error("[week_finalize] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
