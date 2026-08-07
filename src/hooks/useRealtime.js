import { useEffect, useMemo, useRef } from 'react';
import { getMqtt, feedTopic, msgTopic, MSG_PREFIX, userIdFromTopic } from '../lib/mqtt';

// MQTT(HiveMQ) 기반 실시간 신호.
//  - 내 피드(clicker/feed/<myId>)   subscribe → 내 ESP32 기기가 보낸 신호를 클릭으로 처리
//  - 친구 피드(clicker/feed/<friendId>) subscribe → 친구 click/poke 수신(브로드캐스트)
//  - 내 메시지(clicker/msg/<myId>)  subscribe → 특정 친구가 나에게만 보낸 픽셀 그림/하트
// 피드 publish는 ESP32 기기가, 메시지 publish는 웹이 담당한다.
export function useRealtime({ myId, friends, onSignal, onDeviceSignal, onMessage }) {
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;
  const onDeviceRef = useRef(onDeviceSignal);
  onDeviceRef.current = onDeviceSignal;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const friendMap = useRef(new Map());

  // friends 배열은 렌더마다 새로 만들어지므로, 실제 id 집합이 바뀔 때만
  // 재구독하도록 안정적인 키로 바꾼다. (그러지 않으면 매 렌더 재구독한다)
  const friendIds = useMemo(
    () => (friends || []).map((f) => String(f.id)).sort().join(','),
    [friends],
  );

  useEffect(() => {
    friendMap.current = new Map((friends || []).map((f) => [String(f.id), f]));
  }, [friends]);

  useEffect(() => {
    if (!myId) return undefined;
    const client = getMqtt();
    const ids = friendIds ? friendIds.split(',') : [];

    const handler = (topic, payload) => {
      let msg = {};
      try { msg = JSON.parse(payload.toString()); } catch { return; }

      // 나에게만 온 픽셀 그림 / 하트 답장
      if (topic.startsWith(MSG_PREFIX)) { onMessageRef.current?.(msg); return; }

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

    const topics = [feedTopic(myId), msgTopic(myId), ...ids.map((id) => feedTopic(id))];
    client.subscribe(topics, { qos: 0 });

    return () => {
      client.off('message', handler);
      client.unsubscribe(topics);
    };
  }, [myId, friendIds]);
}
