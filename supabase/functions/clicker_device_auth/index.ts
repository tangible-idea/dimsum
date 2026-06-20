// 진입 시 호출: device_code로 기기 상태 확인 + (로그인했다면) 친구목록 부트스트랩
//   body: { device_code }
//   header(optional): Authorization: Bearer <user JWT>
//
// 반환:
//   { registered:false }                         → 등록 페이지로
//   { registered:true, needsLogin:true }         → 구글 로그인 유도
//   { registered:true, owner:false }             → 다른 계정 소유(접근 거부)
//   { registered:true, owner:true, profile, gameState, friends }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { device_code } = await req.json();
    if (!device_code) return json({ error: "device_code required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: device } = await admin
      .from("clicker_devices")
      .select("id, owner_id, registered")
      .eq("device_code", device_code)
      .maybeSingle();

    if (!device || !device.registered || !device.owner_id) {
      return json({ registered: false });
    }

    // 로그인 유저 식별
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ registered: true, needsLogin: true });

    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ registered: true, needsLogin: true });

    if (user.id !== device.owner_id) {
      return json({ registered: true, owner: false, error: "이 기기는 다른 계정 소유입니다." }, 403);
    }

    // 소유자 확인 → 부트스트랩 데이터
    await admin.from("clicker_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);

    const [{ data: profile }, { data: gameState }, { data: fships }] = await Promise.all([
      admin.from("clicker_profiles").select("id, nickname").eq("id", user.id).single(),
      admin.from("clicker_game_states").select("*").eq("owner_id", user.id).single(),
      admin
        .from("clicker_friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ]);

    const friendIds = (fships ?? []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );
    const { data: friends } = friendIds.length
      ? await admin.from("clicker_profiles").select("id, nickname").in("id", friendIds)
      : { data: [] };

    return json({ registered: true, owner: true, profile, gameState, friends });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
