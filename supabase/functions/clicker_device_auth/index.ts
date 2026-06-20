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
    const body = await req.json().catch(() => ({}));
    const { device_code } = body;
    console.log("[device_auth] device_code:", device_code);
    if (!device_code) return json({ error: "device_code required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: device, error: devErr } = await admin
      .from("clicker_devices")
      .select("id, owner_id, registered")
      .eq("device_code", device_code)
      .maybeSingle();
    if (devErr) { console.error("[device_auth] DB error:", devErr.message); return json({ error: devErr.message }, 500); }
    console.log("[device_auth] device:", device);

    if (!device || !device.registered || !device.owner_id) {
      return json({ registered: false });
    }

    // 로그인 유저 식별
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) { console.log("[device_auth] no token → needsLogin"); return json({ registered: true, needsLogin: true }); }

    const { data: userData, error: authErr } = await admin.auth.getUser(token);
    if (authErr) console.warn("[device_auth] getUser error:", authErr.message);
    const user = userData?.user;
    if (!user) return json({ registered: true, needsLogin: true });
    console.log("[device_auth] user:", user.id);

    if (user.id !== device.owner_id) {
      return json({ registered: true, owner: false, error: "이 기기는 다른 계정 소유입니다." }, 403);
    }

    // 소유자 확인 → 부트스트랩 데이터
    await admin.from("clicker_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);

    // 트리거 미적용 대비: 프로필/게임상태 없으면 생성
    const nickname = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "클리커";
    await admin.from("clicker_profiles").upsert({ id: user.id, nickname }, { onConflict: "id", ignoreDuplicates: true });
    await admin.from("clicker_game_states").upsert({ owner_id: user.id }, { onConflict: "owner_id", ignoreDuplicates: true });

    const [{ data: profile, error: pErr }, { data: gameState, error: gsErr }, { data: fships }] = await Promise.all([
      admin.from("clicker_profiles").select("id, nickname, slug").eq("id", user.id).single(),
      admin.from("clicker_game_states").select("*").eq("owner_id", user.id).single(),
      admin
        .from("clicker_friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ]);
    if (pErr) console.warn("[device_auth] profile error:", pErr.message);
    if (gsErr) console.warn("[device_auth] gameState error:", gsErr.message);

    const friendIds = (fships ?? []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );
    const { data: friends } = friendIds.length
      ? await admin.from("clicker_profiles").select("id, nickname").in("id", friendIds)
      : { data: [] };

    console.log("[device_auth] OK → friends:", friendIds.length);
    return json({ registered: true, owner: true, profile, gameState, friends });
  } catch (e) {
    console.error("[device_auth] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
