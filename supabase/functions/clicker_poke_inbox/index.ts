// ESP32(WiFi)가 주기적으로 폴링: 나에게 온 미수신 poke를 가져오고 소비 처리
//   body: { device_code }
//   header: x-device-secret: <device_secret>  (필수)
//   권장 폴링 주기: 2~3초
//
// 반환: { pokes: [{ from, name, ts }], count }
//   count > 0 이면 ESP32가 LED 켜고 화면에 표시

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { authDevice } from "../_shared/device.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const deviceSecret = req.headers.get("x-device-secret") ?? "";
    const { device_code } = await req.json();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const device = await authDevice(admin, device_code, deviceSecret);
    if (!device) return json({ error: "unauthorized device" }, 401);

    await admin.from("clicker_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);

    // 미수신 poke 조회
    const { data: pending } = await admin
      .from("clicker_pokes")
      .select("id, from_user, created_at")
      .eq("to_user", device.owner_id)
      .is("consumed_at", null)
      .order("created_at", { ascending: true })
      .limit(20);

    if (!pending || pending.length === 0) return json({ pokes: [], count: 0 });

    // 보낸 사람 닉네임
    const fromIds = [...new Set(pending.map((p) => p.from_user))];
    const { data: profs } = await admin.from("clicker_profiles").select("id, nickname").in("id", fromIds);
    const nameOf = new Map((profs ?? []).map((p) => [p.id, p.nickname]));

    // 소비 처리(다시 안 뜨도록)
    await admin
      .from("clicker_pokes")
      .update({ consumed_at: new Date().toISOString() })
      .in("id", pending.map((p) => p.id));

    return json({
      count: pending.length,
      pokes: pending.map((p) => ({
        from: p.from_user,
        name: nameOf.get(p.from_user) ?? "친구",
        ts: p.created_at,
      })),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
