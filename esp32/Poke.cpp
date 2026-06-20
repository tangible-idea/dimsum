#include "Poke.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ---- build_flags 로 주입되는 자격증명 (없으면 컴파일 경고용 기본값) ----
#ifndef WIFI_SSID
#define WIFI_SSID "SET_WIFI_SSID"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "SET_WIFI_PASS"
#endif
#ifndef SUPABASE_URL
#define SUPABASE_URL "https://ebpkbakjgzxfahsvrldk.supabase.co"
#endif
#ifndef SUPABASE_ANON_KEY
#define SUPABASE_ANON_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVicGtiYWtqZ3p4ZmFoc3ZybGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTMzNjE5MjEsImV4cCI6MjAyODkzNzkyMX0.XnL0RGQyHIiDnZdfrgKTBBYy5Nu13dWU44pKxw4Wq_o"
#endif
#ifndef DEVICE_CODE
#define DEVICE_CODE "DSJA-JD49XXXX"
#endif
#ifndef DEVICE_SECRET
#define DEVICE_SECRET "SET_DEVICE_SECRET"
#endif

#ifndef POKE_POLL_INTERVAL_MS
#define POKE_POLL_INTERVAL_MS 2000
#endif
#ifndef POKE_WIFI_TIMEOUT_MS
#define POKE_WIFI_TIMEOUT_MS 15000
#endif

namespace {
PokeReceivedCb g_on_received = nullptr;
uint32_t       g_last_poll_ms = 0;

String functions_base() {
  return String(SUPABASE_URL) + "/functions/v1";
}

// Edge Function 호출 (x-device-secret 인증). 반환: HTTP 코드, out: 응답 바디.
int post_json(const char* path, const String& body, String& out) {
  if (WiFi.status() != WL_CONNECTED) return -1;

  WiFiClientSecure client;
  client.setInsecure();  // 데모용. 프로덕션은 루트 CA 핀닝 권장.

  HTTPClient http;
  http.begin(client, functions_base() + path);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);       // 게이트웨이 통과용
  http.addHeader("x-device-secret", DEVICE_SECRET);  // 기기 인증
  int code = http.POST(body);
  out = http.getString();
  http.end();
  return code;
}

String body_device_only() {
  return String("{\"device_code\":\"") + DEVICE_CODE + "\"}";
}
}  // namespace

void poke_setup(PokeReceivedCb onReceived) {
  g_on_received = onReceived;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] 연결중");
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < POKE_WIFI_TIMEOUT_MS) {
    delay(300);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\n[WiFi] 연결됨" : "\n[WiFi] 실패");
}

bool poke_wifi_connected() {
  return WiFi.status() == WL_CONNECTED;
}

void poke_send() {
  String resp;
  int code = post_json("/clicker_poke", body_device_only(), resp);
  Serial.printf("[POKE>] %d %s\n", code, resp.c_str());
}

void poke_loop() {
  if (WiFi.status() != WL_CONNECTED) return;

  uint32_t now = millis();
  if (now - g_last_poll_ms < POKE_POLL_INTERVAL_MS) return;
  g_last_poll_ms = now;

  String resp;
  int code = post_json("/clicker_poke_inbox", body_device_only(), resp);
  if (code != 200) return;

  // 가벼운 파싱: "count":N 과 첫 "name":"..."
  int ci = resp.indexOf("\"count\":");
  int count = (ci >= 0) ? resp.substring(ci + 8).toInt() : 0;
  if (count <= 0) return;

  char name[32] = "친구";
  int ni = resp.indexOf("\"name\":\"");
  if (ni >= 0) {
    int s = ni + 8;
    int e = resp.indexOf('"', s);
    if (e > s) resp.substring(s, e).toCharArray(name, sizeof(name));
  }

  Serial.printf("[POKE<] %d개, 최근: %s\n", count, name);
  if (g_on_received) g_on_received(name, count);
}
