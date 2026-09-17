import mqtt from 'mqtt';

// EMQX Serverless (AWS 싱가포르) — 브라우저는 TLS WebSocket(8084) 사용.
// URL은 포트와 /mqtt 경로가 둘 다 필요하다. 호스트만 적으면 443으로 붙는데
// 이 브로커는 443이 닫혀 있어 조용히 타임아웃된다.
// 값은 .env에서만 온다. 기본값을 두지 않는다 — 값이 빠졌을 때 조용히 엉뚱한
// 브로커에 붙는 것보다 즉시 터지는 편이 낫다. (옛 기본값은 죽은 HiveMQ 주소와
// 평문 비밀번호를 담고 있었고, 그게 번들에 그대로 실려 나갔다.)
const WSS_URL = import.meta.env.VITE_MQTT_WSS_URL;
const USERNAME = import.meta.env.VITE_MQTT_USERNAME;
const PASSWORD = import.meta.env.VITE_MQTT_PASSWORD;

// 설정 누락은 접속 시점에 던진다. 모듈 로드 시점에 던지면 App 임포트가 통째로
// 실패해서 React가 마운트되지 않고, index.html의 부트 스플래시만 영원히 남는다
// — 원인이 안 보이는 가장 나쁜 실패 모양이다. 앱은 뜨고 MQTT만 죽게 한다.
function assertConfig() {
  const entries = { VITE_MQTT_WSS_URL: WSS_URL, VITE_MQTT_USERNAME: USERNAME, VITE_MQTT_PASSWORD: PASSWORD };
  for (const [k, v] of Object.entries(entries)) {
    if (!v) throw new Error(`${k}가 비어 있습니다. .env를 만들었나요? (.env.example 참고)`);
    if (/^your-/.test(v)) throw new Error(`${k}가 아직 .env.example의 템플릿 값입니다.`);
  }
}

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

// 상대 앱이 종료된 동안에도 그림/제어 메시지를 보관하도록 QoS 1로 보낸다.
export function publish(topic, obj) {
  const client = getMqtt();
  const payload = typeof obj === 'string' ? obj : JSON.stringify(obj);
  client.publish(topic, payload, { qos: topic.startsWith(MSG_PREFIX) || topic.startsWith('clicker/ctrl/') ? 1 : 0 });
}

let client = null;

// 앱 전역에서 공유하는 단일 MQTT 클라이언트.
export function getMqtt() {
  if (client) return client;
  assertConfig();
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
