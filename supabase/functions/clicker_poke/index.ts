// ESP32(WiFi)가 버튼을 누르면 호출: 수락된 친구 전원에게 poke 발사
//   body: { device_code }
//   header: x-device-secret: <device_secret>  (필수)
//
// 동작: 기기 인증 → 친구 목록 → pokes 큐에 적재(친구 기기 폴링용)
//       + 친구 브라우저 clicker_feed:<friend> 채널로 broadcast(실시간 표시용)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { authDevice } from "../_shared/device.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 인스턴스 단위 간단 레이트리밋(연타/폭주 방지)
const lastHit = new Map<string, number>();
const MIN_INTERVAL_MS = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const deviceSecret = req.headers.get("x-device-secret") ?? "";
    const { device_code } = await req.json();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const device = await authDevice(admin, device_code, deviceSecret);
    if (!device) return json({ error: "unauthorized device" }, 401);

    const now = Date.now();
    if (now - (lastHit.get(device.id) ?? 0) < MIN_INTERVAL_MS) {
      return json({ ok: true, throttled: true });
    }
    lastHit.set(device.id, now);

    const me = device.owner_id;

    // 보낸 사람 닉네임 + 수락된 친구 목록
    const [{ data: myProfile }, { data: fships }] = await Promise.all([
      admin.from("clicker_profiles").select("nickname").eq("id", me).single(),
      admin
        .from("clicker_friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${me},addressee_id.eq.${me}`),
    ]);

    const friendIds = (fships ?? []).map((f) =>
      f.requester_id === me ? f.addressee_id : f.requester_id
    );
    if (friendIds.length === 0) return json({ ok: true, sent: 0 });

    // 1) 큐 적재 (친구 기기가 clicker_poke_inbox 폴링으로 수신)
    await admin.from("clicker_pokes").insert(
      friendIds.map((to) => ({ from_user: me, to_user: to })),
    );

    // 2) 친구 브라우저 실시간 표시 (각 친구의 feed 채널로 broadcast)
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        messages: friendIds.map((to) => ({
          topic: `clicker_feed:${to}`,
          event: "poke",
          payload: { from: me, fromName: myProfile?.nickname ?? "친구", ts: now },
          private: true,
        })),
      }),
    });

    await admin.from("clicker_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);

    return json({ ok: true, sent: friendIds.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
