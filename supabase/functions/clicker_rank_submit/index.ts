// 주간 랭킹 기록 등록 (로그인 유저가 랭킹 탭에서 호출)
//   body: { mbti }
//   header: Authorization: Bearer <user JWT>
//
// - MBTI를 프로필에 저장하고, 이번 주(KST 월~일) 랭킹에 현재 점수를 스냅샷
// - 점수는 클라이언트 값을 받지 않고 서버의 clicker_game_states.coins에서 읽음

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { MBTI_TYPES, weekEndUtc, weekStartKst } from "../_shared/week.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mbti } = await req.json().catch(() => ({}));
    const type = String(mbti ?? "").toUpperCase();
    if (!MBTI_TYPES.includes(type)) return json({ error: "올바른 MBTI를 선택해주세요." }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "login required" }, 401);

    // 서버 기준 점수 + 닉네임
    const [{ data: gs }, { data: profile }] = await Promise.all([
      admin.from("clicker_game_states").select("coins").eq("owner_id", user.id).single(),
      admin.from("clicker_profiles").select("nickname").eq("id", user.id).single(),
    ]);
    if (!gs) return json({ error: "게임 상태를 찾을 수 없어요." }, 404);

    const weekStart = weekStartKst();
    const score = gs.coins ?? 0;

    const [{ error: pErr }, { error: sErr }] = await Promise.all([
      admin.from("clicker_profiles").update({ mbti: type }).eq("id", user.id),
      admin.from("clicker_weekly_scores").upsert({
        week_start: weekStart,
        owner_id: user.id,
        nickname: profile?.nickname ?? null,
        mbti: type,
        score,
        updated_at: new Date().toISOString(),
      }),
    ]);
    if (pErr || sErr) {
      console.error("[rank_submit]", pErr?.message, sErr?.message);
      return json({ error: (pErr ?? sErr)!.message }, 500);
    }

    return json({ ok: true, week_start: weekStart, week_end: weekEndUtc(weekStart), score, mbti: type });
  } catch (e) {
    console.error("[rank_submit] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
