// Poke 계열 함수 공용: x-device-secret + device_code 로 기기 인증
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuthedDevice = {
  id: string;
  owner_id: string;
};

export async function authDevice(
  admin: SupabaseClient,
  device_code: string,
  device_secret: string,
): Promise<AuthedDevice | null> {
  if (!device_code || !device_secret) return null;

  const { data: device } = await admin
    .from("clicker_devices")
    .select("id, owner_id, device_secret, registered")
    .eq("device_code", device_code)
    .maybeSingle();

  if (!device || !device.registered || !device.owner_id) return null;
  if (device.device_secret !== device_secret) return null;

  return { id: device.id, owner_id: device.owner_id };
}
