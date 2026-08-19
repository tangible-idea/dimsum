// 관리자 전용: 기기 목록/시크릿 열람/재발급/잠금 해제
//   body: { action: "list" | "reveal" | "rotate" | "unlock" | "label", ... }
//   header: Authorization: Bearer <user JWT>  (필수)
//
// 코드 발급 자체는 기기가 첫 부팅 때 clicker_device_provision 으로 스스로 한다.
// 여기서는 그렇게 올라온 기기들을 보고 관리한다.
//
// 관리자 판별: Supabase 시크릿 ADMIN_EMAILS(쉼표 구분)에 포함된 이메일만 통과.
//   supabase secrets set ADMIN_EMAILS="me@example.com,you@example.com"
// 미설정이면 전원 거부(fail-closed).
//
// device_secret은 여기서만 평문으로 나간다. 프론트는 /admin 페이지에서만 호출한다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ---- 관리자 인증 ----
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: userData } = await admin.auth.getUser(token);
    const me = userData?.user;
    if (!me) return json({ error: "login required" }, 401);

    const allow = (Deno.env.get("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const email = (me.email ?? "").toLowerCase();
    if (!allow.length) {
      console.warn("[admin_devices] ADMIN_EMAILS 미설정 → 전원 거부");
      return json({ error: "관리자 목록(ADMIN_EMAILS)이 설정되지 않았습니다." }, 403);
    }
    if (!allow.includes(email)) {
      console.warn("[admin_devices] 거부:", email);
      return json({ error: "관리자 권한이 없습니다." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "list";

    // ---- 라벨 편집 (코드가 자동 생성되므로 어느 보드인지 메모해두는 용도) ----
    if (action === "label") {
      const { device_code } = body;
      if (!device_code) return json({ error: "device_code required" }, 400);
      const { error } = await admin
        .from("clicker_devices")
        .update({ label: (body.label ?? "").trim() || null })
        .eq("device_code", device_code);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ---- 잠금 해제: 등록된 기기가 NVS를 잃었을 때 셀프 프로비저닝을 한 번 허용 ----
    //   registered=false 로 되돌리면 clicker_device_provision 이 같은 hw_id 에
    //   기존 코드/시크릿을 다시 내준다. 소유자(owner_id)는 지우지 않으므로,
    //   주인이 등록 URL을 한 번 더 열어주면 원래 계정에 그대로 다시 붙는다.
    if (action === "unlock") {
      const { device_code } = body;
      if (!device_code) return json({ error: "device_code required" }, 400);
      const { data, error } = await admin
        .from("clicker_devices")
        .update({ registered: false })
        .eq("device_code", device_code)
        .select("device_code, hw_id")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "없는 기기 코드입니다." }, 404);
      console.log("[admin_devices] unlock:", device_code);
      return json({ ok: true });
    }

    // ---- 시크릿 열람 ----
    if (action === "reveal") {
      const { device_code } = body;
      if (!device_code) return json({ error: "device_code required" }, 400);
      const { data, error } = await admin
        .from("clicker_devices")
        .select("device_code, device_secret, label")
        .eq("device_code", device_code)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "없는 기기 코드입니다." }, 404);
      return json({ ok: true, device: data });
    }

    // ---- 시크릿 재발급 (기존 펌웨어는 즉시 인증 실패 → 다시 플래시 필요) ----
    if (action === "rotate") {
      const { device_code } = body;
      if (!device_code) return json({ error: "device_code required" }, 400);
      const { data, error } = await admin
        .from("clicker_devices")
        .update({ device_secret: crypto.randomUUID() })
        .eq("device_code", device_code)
        .select("device_code, device_secret, label")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "없는 기기 코드입니다." }, 404);
      console.log("[admin_devices] rotate:", device_code);
      return json({ ok: true, device: data });
    }

    // ---- 목록 (시크릿 제외) ----
    if (action === "list") {
      const { data: devices, error } = await admin
        .from("clicker_devices")
        .select("device_code, hw_id, label, owner_id, registered, last_seen_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return json({ error: error.message }, 500);

      const ownerIds = [...new Set((devices ?? []).map((d) => d.owner_id).filter(Boolean))];
      let names: Record<string, string> = {};
      if (ownerIds.length) {
        const { data: profiles } = await admin
          .from("clicker_profiles")
          .select("id, nickname, slug")
          .in("id", ownerIds);
        names = Object.fromEntries(
          (profiles ?? []).map((p) => [p.id, p.slug ?? p.nickname ?? "이름없음"]),
        );
      }

      return json({
        ok: true,
        devices: (devices ?? []).map((d) => ({
          ...d,
          owner_name: d.owner_id ? (names[d.owner_id] ?? "알 수 없음") : null,
        })),
      });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("[admin_devices] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
