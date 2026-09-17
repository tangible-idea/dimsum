// 주간 랭킹 조회 (로그인 유저)
//   body: { mbti? }  — MBTI 탭에서 볼 유형(생략 시 내 MBTI)
//   header: Authorization: Bearer <user JWT>
//
// 반환: 이번 주 전체 TOP 20 / MBTI별 TOP 20 / 역대 TOP 20 / 내 순위·점수 /
//       보유 뽑기권 / 주 마감 시각
//
// 역대(all time) 랭킹은 주간 기록이 아니라 clicker_game_states.coins(누적)를 본다.
// 주간 기록은 '기록 등록'을 해야 생기지만 누적은 늘 있으므로, 등록 여부와 무관하게
// 모든 유저가 들어온다.

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

    const [{ data: top }, { data: mbtiTop }, myRankRes, myMbtiRankRes, { data: allTimeRows }, { data: myState }, weeklyCountRes, allTimeCountRes] = await Promise.all([
      rankQuery(),
      viewMbti ? rankQuery(viewMbti) : Promise.resolve({ data: [] }),
      // 내 순위 = 나보다 높은 점수 수 + 1 (동점은 먼저 등록한 쪽이 위지만 근사로 충분)
      mine
        ? admin.from("clicker_weekly_scores")
          .select("owner_id", { count: "exact", head: true })
          .eq("week_start", weekStart).gt("score", mine.score)
        : Promise.resolve({ count: null }),
      // MBTI 는 이제 선택이다 — 안 고른 사람은 전체 랭킹에만 들어간다.
      mine?.mbti
        ? admin.from("clicker_weekly_scores")
          .select("owner_id", { count: "exact", head: true })
          .eq("week_start", weekStart).eq("mbti", mine.mbti).gt("score", mine.score)
        : Promise.resolve({ count: null }),
      admin.from("clicker_game_states")
        .select("owner_id, coins")
        .order("coins", { ascending: false })
        .limit(TOP_N),
      admin.from("clicker_game_states").select("coins").eq("owner_id", user.id).maybeSingle(),
      // "상위 몇 %" 는 순위만으로 못 낸다 — 모수가 있어야 한다.
      admin.from("clicker_weekly_scores")
        .select("owner_id", { count: "exact", head: true }).eq("week_start", weekStart),
      admin.from("clicker_game_states")
        .select("owner_id", { count: "exact", head: true }),
    ]);

    // 역대 랭킹의 닉네임은 따로 읽어 붙인다 — game_states 에는 이름이 없다.
    // (device_auth 가 친구 이름을 채우는 방식과 같다)
    const allTimeIds = (allTimeRows ?? []).map((r) => r.owner_id);
    const { data: allTimeProfiles } = allTimeIds.length
      ? await admin.from("clicker_profiles").select("id, nickname").in("id", allTimeIds)
      : { data: [] };
    const nameById = new Map((allTimeProfiles ?? []).map((p) => [p.id, p.nickname]));
    // 주간과 같은 모양으로 맞춘다 — 앱은 두 목록을 같은 위젯으로 그린다.
    const allTime = (allTimeRows ?? []).map((r) => ({
      owner_id: r.owner_id,
      nickname: nameById.get(r.owner_id) ?? null,
      score: r.coins ?? 0,
    }));

    // 내 역대 순위 = 나보다 누적이 많은 사람 수 + 1
    const { count: aboveMe } = myState
      ? await admin.from("clicker_game_states")
        .select("owner_id", { count: "exact", head: true })
        .gt("coins", myState.coins ?? 0)
      : { count: null };

    return json({
      ok: true,
      week_start: weekStart,
      week_end: weekEndUtc(weekStart),
      my: mine
        ? {
          score: mine.score,
          mbti: mine.mbti,
          rank: (myRankRes.count ?? 0) + 1,
          mbti_rank: myMbtiRankRes.count === null ? null : myMbtiRankRes.count + 1,
        }
        : null,
      my_mbti: mine?.mbti ?? profile?.mbti ?? null,
      view_mbti: viewMbti,
      top: top ?? [],
      mbti_top: mbtiTop ?? [],
      total: weeklyCountRes.count ?? 0,
      all_time_total: allTimeCountRes.count ?? 0,
      all_time: allTime,
      my_all_time: myState
        ? { score: myState.coins ?? 0, rank: (aboveMe ?? 0) + 1 }
        : null,
      items: Object.fromEntries((items ?? []).map((i) => [i.item_type, i.qty])),
    });
  } catch (e) {
    console.error("[rank_get] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
