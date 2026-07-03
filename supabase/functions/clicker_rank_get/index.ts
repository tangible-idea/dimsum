// 주간 랭킹 조회 (로그인 유저)
//   body: { mbti? }  — MBTI 탭에서 볼 유형(생략 시 내 MBTI)
//   header: Authorization: Bearer <user JWT>
//
// 반환: 이번 주 전체 TOP 20 / MBTI별 TOP 20 / 내 순위·점수 / 보유 뽑기권 / 주 마감 시각

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { MBTI_TYPES, weekEndUtc, weekStartKst } from "../_shared/week.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOP_N = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mbti } = await req.json().catch(() => ({}));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "login required" }, 401);

    const weekStart = weekStartKst();

    // 내 이번 주 기록 + 프로필 MBTI + 보유 아이템
    const [{ data: mine }, { data: profile }, { data: items }] = await Promise.all([
      admin.from("clicker_weekly_scores")
        .select("score, mbti, updated_at")
        .eq("week_start", weekStart).eq("owner_id", user.id).maybeSingle(),
      admin.from("clicker_profiles").select("mbti").eq("id", user.id).single(),
      admin.from("clicker_items").select("item_type, qty").eq("owner_id", user.id),
    ]);

    const viewMbti = MBTI_TYPES.includes(String(mbti ?? "").toUpperCase())
      ? String(mbti).toUpperCase()
      : (mine?.mbti ?? profile?.mbti ?? null);

    const rankQuery = (filterMbti?: string) => {
      let q = admin.from("clicker_weekly_scores")
        .select("owner_id, nickname, mbti, score")
        .eq("week_start", weekStart)
        .order("score", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(TOP_N);
      if (filterMbti) q = q.eq("mbti", filterMbti);
      return q;
    };

    const [{ data: top }, { data: mbtiTop }, myRankRes, myMbtiRankRes] = await Promise.all([
      rankQuery(),
      viewMbti ? rankQuery(viewMbti) : Promise.resolve({ data: [] }),
      // 내 순위 = 나보다 높은 점수 수 + 1 (동점은 먼저 등록한 쪽이 위지만 근사로 충분)
      mine
        ? admin.from("clicker_weekly_scores")
          .select("owner_id", { count: "exact", head: true })
          .eq("week_start", weekStart).gt("score", mine.score)
        : Promise.resolve({ count: null }),
      mine
        ? admin.from("clicker_weekly_scores")
          .select("owner_id", { count: "exact", head: true })
          .eq("week_start", weekStart).eq("mbti", mine.mbti).gt("score", mine.score)
        : Promise.resolve({ count: null }),
    ]);

    return json({
      ok: true,
      week_start: weekStart,
      week_end: weekEndUtc(weekStart),
      my: mine
        ? {
          score: mine.score,
          mbti: mine.mbti,
          rank: (myRankRes.count ?? 0) + 1,
          mbti_rank: (myMbtiRankRes.count ?? 0) + 1,
        }
        : null,
      my_mbti: mine?.mbti ?? profile?.mbti ?? null,
      view_mbti: viewMbti,
      top: top ?? [],
      mbti_top: mbtiTop ?? [],
      items: Object.fromEntries((items ?? []).map((i) => [i.item_type, i.qty])),
    });
  } catch (e) {
    console.error("[rank_get] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
