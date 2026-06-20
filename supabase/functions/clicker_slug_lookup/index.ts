// 슬러그로 유저 프로필 공개 조회 (친구 추가 전 미리보기용, 인증 불필요)
//   body: { slug }
//   반환: { id, nickname, slug } | { error }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { slug } = await req.json().catch(() => ({}));
    if (!slug) return json({ error: "slug required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await admin
      .from("clicker_profiles")
      .select("id, nickname, slug")
      .eq("slug", slug.toLowerCase().trim())
      .maybeSingle();

    if (error) { console.error("[slug_lookup]", error.message); return json({ error: error.message }, 500); }
    if (!data) return json({ error: "not_found" }, 404);

    return json({ id: data.id, nickname: data.nickname, slug: data.slug });
  } catch (e) {
    console.error("[slug_lookup] uncaught:", e);
    return json({ error: String(e) }, 500);
  }
});
