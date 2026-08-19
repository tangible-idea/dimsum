// 기기 셀프 프로비저닝: 첫 부팅 때 ESP32가 자기 코드/시크릿을 발급받는다.
//   body:   { hw_id }                     — ESP32 MAC (12 hex, 대문자)
//   header: x-provision-key: <공장키>      — 모든 보드에 공통으로 구워지는 값
//
// 반환: { device_code, device_secret }  → 기기가 NVS에 저장하고 이후 계속 사용
//
// 이 덕분에 보드마다 다시 빌드할 필요가 없다. 같은 이미지를 구워도 hw_id가 다르므로
// 서로 다른 코드를 받는다. NVS가 지워져 다시 호출해도 hw_id가 같으면 같은 값을 돌려준다.
//
// 공장키는 펌웨어 플래시에서 추출될 수 있다고 가정한다. 그래서 이 키만으로는
// "아직 주인이 없는 기기"만 만들 수 있고, 이미 등록된 기기의 시크릿은 꺼낼 수 없다.
// (등록된 기기가 NVS를 잃으면 관리자 페이지에서 잠금 해제 후 재부팅)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 헷갈리는 글자(0/O/1/I) 제외 — 화면에 뜬 코드를 사람이 그대로 옮겨 적는다.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const s = Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const expected = Deno.env.get("DEVICE_PROVISION_KEY") ?? "";
    if (!expected) {
      console.error("[provision] DEVICE_PROVISION_KEY 미설정 → 전원 거부");
      return json({ error: "provisioning disabled" }, 503);
    }
    if ((req.headers.get("x-provision-key") ?? "") !== expected) {
      return json({ error: "bad provision key" }, 401);
    }

    const { hw_id } = await req.json().catch(() => ({}));
    const hw = String(hw_id ?? "").trim().toUpperCase();
    if (!/^[0-9A-F]{12}$/.test(hw)) return json({ error: "hw_id required (12 hex)" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: existing, error: selErr } = await admin
      .from("clicker_devices")
      .select("device_code, device_secret, registered")
      .eq("hw_id", hw)
      .maybeSingle();
    if (selErr) return json({ error: selErr.message }, 500);

    if (existing) {
      // 이미 주인이 있는 기기의 시크릿은 이 키만으로 내주지 않는다.
      // 정상 기기는 NVS에 값이 있어 여기까지 오지 않는다. 여기 오는 경우 =
      // 플래시를 통째로 지웠거나, 남의 MAC을 아는 누군가가 시도한 것.
      if (existing.registered) {
        console.warn("[provision] 등록된 기기 재발급 거부:", hw);
        return json({
          error: "이미 등록된 기기입니다. 관리자 페이지에서 잠금 해제 후 다시 시도하세요.",
          device_code: existing.device_code,   // 어느 기기인지는 알려준다(시크릿은 제외)
        }, 409);
      }
      console.log("[provision] 재발급(미등록):", hw, existing.device_code);
      return json({
        device_code: existing.device_code,
        device_secret: existing.device_secret,
      });
    }

    // 신규 기기 — 코드 충돌 시 재시도
    for (let i = 0; i < 6; i++) {
      const device_code = randomCode();
      const { data, error } = await admin
        .from("clicker_devices")
        .insert({ device_code, hw_id: hw, registered: false })
        .select("device_code, device_secret")
        .single();
      if (!error) {
        console.log("[provision] 신규:", hw, "→", device_code);
        return json({ device_code: data.device_code, device_secret: data.device_secret });
      }
      if (error.code !== "23505") return json({ error: error.message }, 500);
      // hw_id 쪽 중복이면 동시 요청이 먼저 만든 것 → 그 행을 읽어서 반환
      const { data: race } = await admin
        .from("clicker_devices")
        .select("device_code, device_secret")
        .eq("hw_id", hw)
        .maybeSingle();
      if (race) return json(race);
    }

    return json({ error: "코드 생성에 반복 실패했습니다." }, 500);
  } catch (e) {
    console.error("[provision] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
