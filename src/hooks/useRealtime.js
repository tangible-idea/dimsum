import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// 내 채널(clicker_feed:<myId>)로 클릭 송신, 친구 채널 구독해서 click/poke 수신.
export function useRealtime({ session, myId, friends, onSignal }) {
  const channelRef = useRef(null);
  const lastBroadcast = useRef(0);
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  useEffect(() => {
    if (!session || !myId) return undefined;
    supabase.realtime.setAuth(session.access_token);

    const mine = supabase.channel(`clicker_feed:${myId}`, {
      config: { private: true, broadcast: { self: false } },
    });
    mine.subscribe();
    channelRef.current = mine;

    const subs = (friends || []).map((f) =>
      supabase
        .channel(`clicker_feed:${f.id}`, { config: { private: true } })
        .on('broadcast', { event: 'click' }, () => onSignalRef.current(f, 'click'))
        .on('broadcast', { event: 'poke' }, () => onSignalRef.current(f, 'poke'))
        .subscribe()
    );

    return () => {
      supabase.removeChannel(mine);
      subs.forEach((s) => supabase.removeChannel(s));
      channelRef.current = null;
    };
  }, [session, myId, friends]);

  const lastPoke = useRef(0);

  const broadcastClick = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastBroadcast.current < 150) return;
    lastBroadcast.current = now;
    ch.send({ type: 'broadcast', event: 'click', payload: { ts: now } });
  }, []);

  const broadcastPoke = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastPoke.current < 10000) return false; // 10초 쿨다운
    lastPoke.current = now;
    ch.send({ type: 'broadcast', event: 'poke', payload: { ts: now } });
    return true;
  }, []);

  return { broadcastClick, broadcastPoke };
}
