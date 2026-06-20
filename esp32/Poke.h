#pragma once
#include <Arduino.h>

/*
 * 클리커 키우기 - ESP32 Poke 모듈 (PlatformIO / Arduino framework)
 *
 * 기존 BLE 키보드 펌웨어에 "WiFi Poke(desk buddy)" 기능을 더한다.
 *  - poke_send() : 버튼 눌렀을 때 친구 전원에게 poke 발사
 *  - poke_loop() : loop()에서 호출, 2~3초마다 내 수신함 폴링
 *  - 수신 시 PokeReceivedCb 콜백 호출 → 거기서 LED/디스플레이 제어
 *
 * 자격증명은 build_flags 로 주입 (platformio.ini 참고).
 */

// poke 수신 콜백: (보낸 사람 닉네임, 이번에 받은 개수)
typedef void (*PokeReceivedCb)(const char* fromName, int count);

// WiFi 연결 + 콜백 등록. setup()에서 1회 호출.
void poke_setup(PokeReceivedCb onReceived = nullptr);

// 버튼 눌림 처리부에서 호출 → 친구들에게 poke 발사.
void poke_send();

// loop()에서 매번 호출 → 폴링 주기 도래 시 수신함 확인.
void poke_loop();

// 현재 WiFi 연결 여부.
bool poke_wifi_connected();
