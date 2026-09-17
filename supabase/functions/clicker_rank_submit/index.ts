// 주간 랭킹 기록 등록 (웹은 랭킹 탭에서, 앱은 탭이 멎으면 자동으로 호출)
//   body: { mbti? }  — 보내면 프로필에 저장한다. 앱처럼 MBTI를 안 쓰는
//                      클라이언트는 생략하며, 그때는 프로필에 이미 있는 값을 쓴다.
//   header: Authorization: Bearer <user JWT>
//
// - 이번 주(KST 월~일) 랭킹에 현재 점수를 스냅샷
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
    const given = String(mbti ?? "").toUpperCase();
    // 보냈는데 목록에 없는 값이면 오타다 — 조용히 넘기지 않는다.
    if (given && !MBTI_TYPES.includes(given)) {
      return json({ error: "올바른 MBTI를 선택해주세요." }, 400);
    }
    const type = given || null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "login required" }, 401);

    // 서버 기준 점수 + 닉네임
    const [{ data: gs }, { data: profile }] = await Promise.all([
      admin.from("clicker_game_states").select("coins").eq("owner_id", user.id).single(),
      admin.from("clicker_profiles").select("nickname, mbti").eq("id", user.id).single(),
    ]);
    if (!gs) return json({ error: "게임 상태를 찾을 수 없어요." }, 404);

    const weekStart = weekStartKst();
    const score = gs.coins ?? 0;

    // 랭킹 행의 MBTI: 이번에 보낸 값 > 프로필에 있던 값 > 없음(전체 랭킹만 참여)
    const rowMbti = type ?? profile?.mbti ?? null;

    const [{ error: pErr }, { error: sErr }] = await Promise.all([
      type
        ? admin.from("clicker_profiles").update({ mbti: type }).eq("id", user.id)
        : Promise.resolve({ error: null }),
      admin.from("clicker_weekly_scores").upsert({
        week_start: weekStart,
        owner_id: user.id,
        nickname: profile?.nickname ?? null,
        mbti: rowMbti,
        score,
        updated_at: new Date().toISOString(),
      }),
    ]);
    if (pErr || sErr) {
      console.error("[rank_submit]", pErr?.message, sErr?.message);
      return json({ error: (pErr ?? sErr)!.message }, 500);
    }

    return json({ ok: true, week_start: weekStart, week_end: weekEndUtc(weekStart), score, mbti: rowMbti });
  } catch (e) {
    console.error("[rank_submit] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
