// 친구 추가 (슬러그 초대 링크를 통해 방문한 유저가 호출)
//   body: { target_user_id }
//   header: Authorization: Bearer <user JWT>
//
// - 이미 accepted → 그냥 성공 반환
// - pending(상대방이 먼저 요청) → accepted 로 업데이트
// - 없음 → insert (accepted)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { target_user_id } = await req.json().catch(() => ({}));
    if (!target_user_id) return json({ error: "target_user_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "login required" }, 401);
    if (user.id === target_user_id) return json({ error: "자기 자신은 친구 추가할 수 없어요." }, 400);

    // 대상 유저 존재 확인
    const { data: target } = await admin
      .from("clicker_profiles")
      .select("id, nickname")
      .eq("id", target_user_id)
      .maybeSingle();
    if (!target) return json({ error: "존재하지 않는 유저예요." }, 404);

    // 기존 관계 확인
    const { data: existing } = await admin
      .from("clicker_friendships")
      .select("id, status, requester_id, addressee_id")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${target_user_id}),` +
        `and(requester_id.eq.${target_user_id},addressee_id.eq.${user.id})`
      )
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") return json({ ok: true, already: true, target });
      // pending 또는 blocked → accepted 로 전환
      await admin.from("clicker_friendships").update({ status: "accepted" }).eq("id", existing.id);
      return json({ ok: true, target });
    }

    // 새로 추가
    const { error: insErr } = await admin.from("clicker_friendships").insert({
      requester_id: user.id,
      addressee_id: target_user_id,
      status: "accepted",
    });
    if (insErr) { console.error("[friend_add] insert:", insErr.message); return json({ error: insErr.message }, 500); }

    return json({ ok: true, target });
  } catch (e) {
    console.error("[friend_add] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
