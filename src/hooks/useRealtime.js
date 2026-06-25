import { useEffect, useRef } from 'react';
import { getMqtt, feedTopic, userIdFromTopic } from '../lib/mqtt';

// MQTT(HiveMQ) 기반 실시간 신호 — 웹은 수신 전용이다.
//  - 내 피드(clicker/feed/<myId>) subscribe → 내 ESP32 기기가 보낸 신호를 클릭 동작으로 처리
//  - 친구 피드(clicker/feed/<friendId>) subscribe → 친구 click/poke 수신
// 신호 publish(송신)는 ESP32 기기만 담당한다.
export function useRealtime({ myId, friends, onSignal, onDeviceSignal }) {
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;
  const onDeviceRef = useRef(onDeviceSignal);
  onDeviceRef.current = onDeviceSignal;
  const friendMap = useRef(new Map());

  useEffect(() => {
    friendMap.current = new Map((friends || []).map((f) => [String(f.id), f]));
  }, [friends]);

  useEffect(() => {
    if (!myId) return undefined;
    const client = getMqtt();

    const handler = (topic, payload) => {
      let msg = {};
      try { msg = JSON.parse(payload.toString()); } catch { return; }
      const uid = userIdFromTopic(topic);

      // 내 토픽 = 내 ESP32 기기가 보낸 신호 → 클릭 동작
      if (uid === String(myId)) { onDeviceRef.current?.(msg); return; }

      // 친구 토픽 = 친구 신호
      const f = friendMap.current.get(uid);
      if (!f) return;
      const type = msg.e === 'poke' ? 'poke' : msg.e === 'click' ? 'click' : null;
      if (type) onSignalRef.current?.(f, type);
    };
    client.on('message', handler);

    // 내 토픽 + 친구 토픽 모두 구독
    const topics = [feedTopic(myId), ...(friends || []).map((f) => feedTopic(f.id))];
    client.subscribe(topics, { qos: 0 });

    return () => {
      client.off('message', handler);
      client.unsubscribe(topics);
    };
  }, [myId, friends]);
}
