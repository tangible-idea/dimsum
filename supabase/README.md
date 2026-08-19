# 클리커 키우기 — 백엔드 (Supabase)

구글 로그인(유저) = 신원, ESP32 기기는 유저 소유물. 친구·채널은 **유저 단위**.

## 두 가지 신호 경로

| 모드 | 트리거 | 경로 | 용도 |
|---|---|---|---|
| **게임 클릭** | ESP32 BLE 키보드 → 폰 | 브라우저 keydown → 직접 broadcast | 폰 세팅하고 게임할 때 |
| **Poke** | ESP32 단독 WiFi | ESP32 → `clicker_poke` → 친구 기기(폴링) + 브라우저(broadcast) | 책상 위 desk buddy, 폰 없이 |

- 게임 클릭 전파: 브라우저가 구글 세션으로 `clicker_feed:<my_user_id>` 채널에 직접 broadcast → 친구 브라우저 수신
- Poke 전파: ESP32가 `clicker_poke` 호출 → 친구별 `clicker_pokes` 큐 적재(기기 폴링) + 친구 `clicker_feed` 채널 broadcast(브라우저)
- Poke 수신(기기): ESP32가 `clicker_poke_inbox`를 2~3초 폴링 → 새 poke 있으면 LED+화면 반응

> 모든 DB 객체·함수·채널 이름에 `clicker_` 접두 (공유 Supabase 프로젝트 충돌 방지).

## 구성

```
supabase/
  migrations/0001_init.sql      테이블(clicker_*) + RLS + Realtime Authorization
  functions/
    clicker_device_auth/        진입: 기기 상태 확인 + 친구 부트스트랩
    clicker_device_register/    최초 등록: device_code 클레임 (device_secret 1회 발급)
    clicker_poke/               ESP32 → 친구들에게 poke 발사
    clicker_poke_inbox/         ESP32 폴링 → 내게 온 poke 수신/소비
    _shared/cors.ts, device.ts
  config.toml

esp32/
  Poke.h / Poke.cpp             기존 BLE 펌웨어에 붙이는 WiFi Poke 모듈 (PlatformIO)
  platformio.ini                자격증명 build_flags 예시
```

### ESP32 통합 (기존 main.cpp에 연결)

`Poke.h` / `Poke.cpp` 를 `src/` 에 두고:

```cpp
#include "Poke.h"

// poke 수신 시: LED 최대 밝기 + 화면에 누가 찔렀는지 표시
static void on_poke(const char* fromName, int count) {
  ledcWrite(LED_PWM_CHANNEL, 255);           // 기존 LED 채널 재사용
  display.clearBuffer();
  display.setFont(u8g2_font_6x12_tf);
  display.drawStr(0, 12, "POKE!");
  display.drawStr(0, 30, fromName);
  display.sendBuffer();
  last_click_ms = millis();                  // 기존 idle-fade 로직 재활용해 잠시 후 복귀
}

void setup() {
  /* ... 기존 setup ... */
  poke_setup(on_poke);                        // WiFi 연결 + 콜백 등록
}

void loop() {
  /* ... 기존 update_switch / display / led ... */
  poke_loop();                                // 2~3초마다 수신함 폴링
}

// update_switch()의 "버튼 눌림" 분기 안에서:
//   ++click_count; ... ble_send_key(' ');
//   poke_send();                             // ← 친구들에게 poke 발사 한 줄 추가
```

> BLE + WiFi 동시 구동은 부담이 큽니다. 폰과 BLE 페어링 중이 아닐 때만 `poke_setup()`/`poke_loop()`를 쓰도록 모드 분기를 권장합니다.

## 배포

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
supabase functions deploy clicker_device_auth clicker_device_register clicker_poke clicker_poke_inbox
```
+ 대시보드 → Authentication → Providers → Google 활성화.

## 등록 → 기기 세팅 흐름

기기 코드는 **빌드에 박지 않는다.** 모든 보드에 같은 펌웨어를 굽고, 기기가 첫 부팅 때
스스로 발급받는다. 보드마다 다시 빌드할 일이 없다.

1. 보드에 펌웨어 업로드 (`pio run -t upload`) → 전원 ON → `Clicker-XXXX` AP에서 집 WiFi 설정
2. WiFi가 붙으면 ESP32가 `clicker_device_provision` 호출
   - 자기 MAC(`hw_id`) + 공통 공장키(`x-provision-key`)를 보내고 `device_code`/`device_secret`을 받는다
   - NVS에 저장 → 다음 부팅부턴 건너뛴다. NVS를 잃어도 같은 `hw_id`면 같은 값을 다시 받는다
3. 아직 주인이 없으므로 기기가 **화면에 코드를 띄운다** (스티커에 미리 인쇄할 수 없으니)
4. 주인이 `domain.com/<화면의 코드>` 진입 → 구글 로그인 → `clicker_device_register`
5. 다음 부트스트랩(등록 전엔 5초 주기)에서 성공 → 화면이 카운터로 전환

관리자는 `domain.com/admin` 에서 올라온 기기 목록/라벨/잠금 해제를 관리한다.

### 필요한 시크릿

```bash
supabase secrets set DEVICE_PROVISION_KEY=<secrets.ini의 provision_key와 같은 값>
supabase secrets set ADMIN_EMAILS="me@example.com"
```

## API 요약

| 함수 | 인증 | body | 용도 |
|---|---|---|---|
| `clicker_device_auth` | (선택) 유저 JWT | `{device_code}` | 진입 분기 + 부트스트랩 |
| `clicker_device_provision` | `x-provision-key` | `{hw_id}` | 기기 셀프 발급 (코드+시크릿) |
| `clicker_device_register` | 유저 JWT | `{device_code, label?}` | 기기 클레임 |
| `clicker_admin_devices` | 유저 JWT (ADMIN_EMAILS) | `{action, ...}` | 관리자: 목록/라벨/잠금해제/재발급 |
| `clicker_poke` | `x-device-secret` | `{device_code}` | 친구 전원에게 poke |
| `clicker_poke_inbox` | `x-device-secret` | `{device_code}` | 내 poke 수신/소비 |

## 클라이언트(브라우저) 실시간 예시

```js
supabase.realtime.setAuth(session.access_token) // 구글 로그인 세션

// 내 클릭을 친구에게 (게임 모드)
const mine = supabase.channel(`clicker_feed:${myUserId}`, { config: { private: true } })
mine.subscribe()
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  mine.send({ type: "broadcast", event: "click", payload: { ts: Date.now() } })
})

// 친구의 클릭/poke 수신
for (const fid of friendUserIds) {
  supabase.channel(`clicker_feed:${fid}`, { config: { private: true } })
    .on("broadcast", { event: "click" }, (m) => showFriendClick(fid, m.payload))
    .on("broadcast", { event: "poke" },  (m) => showFriendPoke(fid, m.payload))
    .subscribe()
}
```

## 보안 요약
- 클라이언트 anon key로는 테이블 직접 쓰기 불가 (RLS 기본 차단)
- `clicker_pokes` 테이블은 정책 없음 = 클라이언트 완전 차단, Edge Function(service_role) 독점
- ESP32 poke는 `device_secret`로 인증, 기기 클레임은 최초 1회만(타 계정 거부)
- broadcast: 송신은 내 채널만, 수신은 내 채널+수락된 친구만 (realtime.messages RLS)
- `device_secret`은 등록 응답 1회만 노출 → 절대 커밋 금지(빌드 플래그/secrets로 관리)
