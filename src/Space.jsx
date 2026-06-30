import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { supabase, googleLogin } from './lib/supabase';
import { DISH_TYPES } from './lib/shop';
import WorldScene from './game/WorldScene';

// uid 를 결정적으로 딤섬 캐릭터에 매핑(플레이어마다 다른 만두).
function pickAsset(uid) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return DISH_TYPES[h % DISH_TYPES.length].asset;
}

export default function Space() {
  const [phase, setPhase] = useState('loading'); // loading | login | ready
  const [player, setPlayer] = useState(null);
  const [headcount, setHeadcount] = useState(1);
  const hostRef = useRef(null);
  const gameRef = useRef(null);

  // 인증 + 내 프로필/상태 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session) { setPhase('login'); return; }

      const uid = session.user.id;
      const [{ data: prof }, { data: gs }] = await Promise.all([
        supabase.from('clicker_profiles').select('slug, nickname').eq('id', uid).maybeSingle(),
        supabase.from('clicker_game_states').select('total_clicks').eq('owner_id', uid).maybeSingle(),
      ]);
      if (!alive) return;

      const slug = prof?.slug || prof?.nickname || `user-${uid.slice(0, 6)}`;
      setPlayer({ uid, slug, asset: pickAsset(uid), clicks: Number(gs?.total_clicks || 0) });
      setPhase('ready');
    })();
    return () => { alive = false; };
  }, []);

  // Phaser 게임 생성
  useEffect(() => {
    if (phase !== 'ready' || !player || !hostRef.current) return undefined;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: '#0b0b0f',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      physics: { default: 'arcade' },
      scene: [WorldScene],
    });
    gameRef.current = game;
    game.registry.set('player', player);
    game.events.on('headcount', setHeadcount);

    return () => {
      game.events.off('headcount', setHeadcount);
      game.destroy(true);
      gameRef.current = null;
    };
  }, [phase, player]);

  return (
    <div className="space-root">
      <div ref={hostRef} className="space-canvas" />

      {phase === 'ready' && (
        <header className="space-hud">
          <div className="title">🥟 딤섬 메타버스</div>
          <div className="hud-right">
            <span className="headcount">👥 {headcount}</span>
            <button className="logout" onClick={() => supabase.auth.signOut().then(() => location.reload())}>
              로그아웃
            </button>
          </div>
        </header>
      )}

      {phase === 'ready' && (
        <div className="space-hint">맵을 클릭하면 캐릭터가 이동해요</div>
      )}

      {phase === 'loading' && <div className="space-center">불러오는 중…</div>}

      {phase === 'login' && (
        <div className="space-center">
          <div className="login-card">
            <div className="login-title">🥟 딤섬 메타버스</div>
            <div className="login-sub">구글로 로그인하고 맵에 입장하세요</div>
            <button className="google-btn" onClick={() => googleLogin()}>구글로 시작하기</button>
          </div>
        </div>
      )}
    </div>
  );
}
