import mqtt from 'mqtt';

// HiveMQ Cloud — 브라우저는 TLS WebSocket(8884) 사용.
const WSS_URL = import.meta.env.VITE_MQTT_WSS_URL ||
  'wss://db6292909b794a2eba94ffe10d879db9.s1.eu.hivemq.cloud:8884/mqtt';
const USERNAME = import.meta.env.VITE_MQTT_USERNAME || 'clickers';
const PASSWORD = import.meta.env.VITE_MQTT_PASSWORD || '6cCB5q72upQi@qK';

// 유저별 피드 토픽: 본인이 publish, 친구들이 subscribe.
export const feedTopic = (userId) => `clicker/feed/${userId}`;

// 제어 토픽: 웹이 publish, 내 ESP32가 subscribe (게임 시작 등).
export const ctrlTopic = (userId) => `clicker/ctrl/${userId}`;

// 메시지 토픽: 특정 상대에게만 보내는 픽셀 그림.
// 보내는 쪽이 상대 id로 publish → 상대 기기와 상대 웹이 subscribe.
export const msgTopic = (userId) => `clicker/msg/${userId}`;
export const MSG_PREFIX = 'clicker/msg/';

// 토픽 끝의 userId 추출.
export const userIdFromTopic = (topic) => topic.slice(topic.lastIndexOf('/') + 1);

// 객체를 JSON으로 publish (qos 0).
export function publish(topic, obj) {
  const client = getMqtt();
  const payload = typeof obj === 'string' ? obj : JSON.stringify(obj);
  client.publish(topic, payload, { qos: 0 });
}

let client = null;

// 앱 전역에서 공유하는 단일 MQTT 클라이언트.
export function getMqtt() {
  if (client) return client;
  client = mqtt.connect(WSS_URL, {
    username: USERNAME,
    password: PASSWORD,
    clientId: `web_${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 3000,
    keepalive: 30,
    clean: true,
  });
  client.on('error', (e) => console.warn('[mqtt]', e?.message || e));
  return client;
}
