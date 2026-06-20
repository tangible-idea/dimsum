// 최초 등록: 로그인한 유저가 device_code를 자기 계정에 클레임
//   body: { device_code, label? }
//   header: Authorization: Bearer <user JWT>  (필수)
//
// device_secret은 "이 응답에서 단 한 번" 반환됨 → ESP32 펌웨어(Poke용)에 주입할 것.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { device_code, label } = await req.json();
    if (!device_code) return json({ error: "device_code required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "login required" }, 401);

    const { data: existing } = await admin
      .from("clicker_devices")
      .select("id, owner_id")
      .eq("device_code", device_code)
      .maybeSingle();

    // 이미 다른 사람 소유면 거부
    if (existing?.owner_id && existing.owner_id !== user.id) {
      return json({ error: "이 기기는 이미 다른 계정에 등록되어 있습니다." }, 409);
    }

    let device;
    if (existing) {
      const { data, error } = await admin
        .from("clicker_devices")
        .update({ owner_id: user.id, label: label ?? null, registered: true })
        .eq("id", existing.id)
        .select("id, device_code, device_secret, label")
        .single();
      if (error) throw error;
      device = data;
    } else {
      const { data, error } = await admin
        .from("clicker_devices")
        .insert({ device_code, owner_id: user.id, label: label ?? null, registered: true })
        .select("id, device_code, device_secret, label")
        .single();
      if (error) throw error;
      device = data;
    }

    return json({ ok: true, device }); // device.device_secret 포함 (한 번만 노출 → 펌웨어에 주입)
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
