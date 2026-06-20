import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmt, levelInfo, LEVEL_NAMES, NEWS } from './lib/game';
import { deviceAuth, deviceCode, deviceRegister, googleLogin, inviteSlug, supabase, updateSlug } from './lib/supabase';
import { useGame } from './hooks/useGame';
import { useRealtime } from './hooks/useRealtime';
import Character from './components/Character';
import Shop from './components/Shop';
import FriendBar from './components/FriendBar';
import Gate from './components/Gate';
import InviteModal from './components/InviteModal';
import FindFriendsModal from './components/FindFriendsModal';

function Stars() {
  const stars = useMemo(
    () => Array.from({ length: 70 }, () => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: (Math.random() * 3).toFixed(2),
      size: (1 + Math.random() * 1.5).toFixed(1),
    })),
    []
  );
  return (
    <div className="stars">
      {stars.map((s, i) => (
        <div key={i} className="star" style={{
          left: s.left + '%', top: s.top + '%', animationDelay: s.delay + 's',
          width: s.size + 'px', height: s.size + 'px',
        }} />
      ))}
    </div>
  );
}

function News() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => v + 1), 18000);
    return () => clearInterval(t);
  }, []);
  return <div className="news"><span>{'🥟 ' + NEWS[i % NEWS.length]}</span></div>;
}

function Toast({ data }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!data.ts) return undefined;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [data.ts]);
  return <div className={'toast' + (show ? ' show' : '')}>{data.msg}</div>;
}

export default function App() {
  const game = useGame();
  const { snap } = game;

  const characterRef = useRef(null);
  const coinsRef = useRef(null);

  const [gate, setGate] = useState({ state: 'loading' });
  const [auth, setAuth] = useState({ ready: false, session: null, myId: null, profile: null, friends: [] });
  const [friendSignal, setFriendSignal] = useState(null);
  const [toastData, setToastData] = useState({ msg: '', ts: 0 });

  const [invite, setInvite] = useState(null);
  const [findFriendsOpen, setFindFriendsOpen] = useState(false);
  const [slugInput, setSlugInput] = useState('');
  const [slugEditing, setSlugEditing] = useState(false);
  const [slugSaving, setSlugSaving] = useState(false);

  const readyRef = useRef(false);
  readyRef.current = auth.ready;
  const prevLevel = useRef(snap.level.lvl);

  const toast = useCallback((msg) => setToastData({ msg, ts: Date.now() }), []);

  const saveSlug = useCallback(async () => {
    const val = slugInput.trim().toLowerCase();
    if (!val || val === auth.profile?.slug) { setSlugEditing(false); return; }
    if (!/^[a-z0-9][a-z0-9\-]{1,18}[a-z0-9]$/.test(val)) {
      toast('슬러그는 영문 소문자·숫자·하이픈, 3~20자로 입력해주세요.');
      return;
    }
    setSlugSaving(true);
    const { data, error } = await updateSlug(auth.myId, val);
    setSlugSaving(false);
    if (error) { toast(error.message?.includes('unique') ? '이미 사용 중인 슬러그예요.' : '저장 실패'); return; }
    setAuth((a) => ({ ...a, profile: { ...a.profile, slug: data.slug } }));
    setSlugEditing(false);
    toast('슬러그가 저장됐어요 ✅');
  }, [slugInput, auth.profile, auth.myId, toast]);

  const copyInviteUrl = useCallback(() => {
    const slug = auth.profile?.slug;
    if (!slug) { toast('먼저 슬러그를 설정해주세요!'); return; }
    const url = `${location.origin}${location.pathname}?invite=${slug}`;
    navigator.clipboard.writeText(url).then(() => toast('초대 링크가 복사됐어요 🔗')).catch(() => toast(url));
  }, [auth.profile, toast]);

  // ---- 친구 신호 수신 ----
  const onSignal = useCallback((f, type) => {
    setFriendSignal({ id: f.id, type, ts: Date.now() });
    const name = f.nickname || '친구';
    if (type === 'poke') {
      toast(`👉 ${name} 님이 콕 찔렀어요!`);
      characterRef.current?.triggerFriend(name, true);
    } else {
      toast(`🖱️ ${name} 님이 클릭 중!`);
    }
  }, [toast]);

  const { broadcastClick, broadcastPoke } = useRealtime({
    session: auth.session, myId: auth.myId, friends: auth.friends, onSignal,
  });

  // ---- 부팅 / 인증 ----
  const fnError = useCallback(async (error, data, fallback) => {
    const str = (v) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
    if (data?.error) { console.error('[gate]', data.error); return str(data.error); }
    if (error?.context) {
      try {
        const j = await error.context.clone().json();
        console.error('[gate fn]', j);
        return str(j?.error ?? j?.message ?? fallback);
      } catch { /* ignore */ }
    }
    if (error) console.error('[gate]', error);
    return fallback;
  }, []);

  // boot를 ref로 노출해 register → boot 순환 의존 방지
  const bootRef = useRef(null);

  const register = useCallback(async () => {
    setGate({ state: 'loading', msg: '기기를 등록하는 중...' });
    const { data, error } = await deviceRegister();
    if (error || !data || !data.ok) {
      const msg = await fnError(error, data, '등록에 실패했어요.');
      setGate({ state: 'error', msg });
      return;
    }
    bootRef.current?.();
  }, [fnError]);

  const boot = useCallback(async () => {
    if (!deviceCode) { setGate({ state: 'nocode' }); return; }
    setGate({ state: 'loading' });
    const { data: { session } } = await supabase.auth.getSession();
    const { data: res, error } = await deviceAuth();
    if (error || !res) {
      const msg = await fnError(error, res, '서버에 연결하지 못했어요.');
      setGate({ state: 'error', msg });
      return;
    }
    if (res.registered === false) {
      if (session) { register(); return; }
      setGate({ state: 'register' }); return;
    }
    if (res.needsLogin) { setGate({ state: 'login' }); return; }
    if (res.owner === false) { setGate({ state: 'owned' }); return; }
    game.seedFromCloud(res.gameState);
    const profile = res.profile;
    setSlugInput(profile?.slug || '');
    setAuth({ ready: true, session, myId: session.user.id, profile, friends: res.friends || [] });
    setGate(null);
    toast(`${profile?.nickname || '환영'}님, 어서오세요! 🥟`);

    // 친구 초대 링크로 접속한 경우
    if (inviteSlug) {
      setInvite({ slug: inviteSlug, myId: session.user.id, session,
        onDone: (target) => {
          setAuth((a) => ({ ...a, friends: [...a.friends.filter((f) => f.id !== target.id), target] }));
        }
      });
    }
  }, [game, register, fnError, toast]);
  bootRef.current = boot;

  useEffect(() => { boot(); /* eslint-disable-next-line */ }, []);

  // 오프라인 보상
  useEffect(() => {
    if (game.offlineReward > 0) {
      const t = setTimeout(() => toast(`오프라인 보상 +${fmt(game.offlineReward)} 코인`), 600);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 레벨업 토스트
  useEffect(() => {
    if (snap.level.lvl > prevLevel.current) toast(`🎉 Lv.${snap.level.lvl} 달성!`);
    prevLevel.current = snap.level.lvl;
  }, [snap.level.lvl, toast]);

  // ---- 클릭 처리 ----
  const popCoins = () => {
    const el = coinsRef.current;
    if (!el) return;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  };
  const handleClick = useCallback(() => {
    if (!readyRef.current) return;
    const power = game.click();
    characterRef.current?.triggerClick(power);
    popCoins();
    broadcastClick();
  }, [game, broadcastClick]);

  useEffect(() => {
    const h = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      handleClick();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleClick]);

  // ---- 클라우드 세이브 ----
  useEffect(() => {
    if (!auth.ready || !auth.myId) return undefined;
    const id = setInterval(async () => {
      const S = game.sRef.current;
      try {
        await supabase.from('clicker_game_states').update({
          total_clicks: Math.round(S.totalClicks),
          coins: Math.round(S.coins),
          exp: Math.round(S.totalEarned),
          level: levelInfo(S).lvl,
        }).eq('owner_id', auth.myId);
      } catch (e) { /* ignore */ }
    }, 10000);
    return () => clearInterval(id);
  }, [auth.ready, auth.myId, game.sRef]);

  const li = snap.level;
  const pct = Math.min(100, (li.cur / li.need) * 100);
  const levelName = LEVEL_NAMES[Math.min(LEVEL_NAMES.length - 1, li.lvl - 1)];

  return (
    <>
      <Stars />
      <Toast data={toastData} />
      <div className="app">
        <News />
        <div className="game">
          <div className="left">
            <div className="title">🥟 클리커 키우기</div>
            <div className="level">Lv.{li.lvl} {levelName}</div>
            <div className="progress"><div style={{ width: pct + '%' }} /></div>
            <div className="progressText">Lv.{li.lvl + 1}까지 {fmt(li.need - li.cur)} 코인 ({pct.toFixed(1)}%)</div>
            <div className="coin"><span className="ic">🪙</span><span className="coins" ref={coinsRef}>{fmt(snap.coins)}</span></div>
            <div className="persec">초당 {fmt(snap.perSec)} 코인</div>
            <FriendBar
              friends={auth.friends}
              signal={friendSignal}
              onFindFriends={auth.ready ? () => setFindFriendsOpen(true) : undefined}
              onPoke={auth.ready && auth.friends.length > 0 ? () => {
                const sent = broadcastPoke();
                if (sent) toast('👉 친구들을 콕 찔렀어요!');
                else toast('잠깐! 10초 후에 다시 찌를 수 있어요 ⏳');
              } : undefined}
            />
            <div className="mylink">
              {auth.ready && (
                slugEditing ? (
                  <span className="mylink-edit">
                    <input
                      autoFocus
                      value={slugInput}
                      placeholder="my-slug"
                      onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveSlug(); if (e.key === 'Escape') setSlugEditing(false); }}
                      onBlur={saveSlug}
                      disabled={slugSaving}
                    />
                  </span>
                ) : (
                  <span className="mylink-slug" onClick={() => setSlugEditing(true)}>
                    {auth.profile?.slug ? `@${auth.profile.slug}` : '슬러그 설정하기 ✏️'}
                  </span>
                )
              )}
              {auth.ready && !slugEditing && (
                <button className="mylink-copy" onClick={copyInviteUrl} title="초대 링크 복사">🔗</button>
              )}
            </div>
            <Character ref={characterRef} />
            <div className="combo">🔥 클릭 x{snap.combo.toFixed(1)}</div>
          </div>
          <Shop snap={snap} buyGen={game.buyGen} buyClickUpgrade={game.buyClickUpgrade} />
        </div>
      </div>

      <InviteModal invite={invite} onClose={() => setInvite(null)} />
      <FindFriendsModal
        open={findFriendsOpen}
        onClose={() => setFindFriendsOpen(false)}
        onAdded={(user) => setAuth((a) => ({ ...a, friends: [...a.friends.filter((f) => f.id !== user.id), user] }))}
      />

      {gate && (
        <Gate
          gate={gate}
          deviceCode={deviceCode}
          onGoogle={googleLogin}
          onStart={boot}
          onRetry={boot}
          onDemo={() => { setAuth((a) => ({ ...a, ready: true })); setGate(null); }}
          onLogout={async () => { await supabase.auth.signOut(); googleLogin(); }}
          onCopy={(s) => { try { navigator.clipboard.writeText(s); toast('기기 키를 복사했어요'); } catch (e) { /* ignore */ } }}
        />
      )}
    </>
  );
}
