import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceAuth, deviceCode, deviceRegister, googleLogin, previewMode, supabase } from './lib/supabase';
import { useRealtime } from './hooks/useRealtime';
import Gate from './components/Gate';

const fmt = (n) => (n || 0).toLocaleString('en-US');
const todayKey = () => new Date().toISOString().slice(0, 10);
const QUEST_GOAL = 500;

// 글로벌 랭킹은 game_states RLS(본인+친구 한정)로 클라 계산 불가 → RPC 붙기 전까지 플레이스홀더.
const RANK_LABEL = '#24 · 상위 8%';
const initial = (name) => ([...(name || '?')][0] || '?').toUpperCase();

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

// 아이콘(디자인의 SVG 그대로) ------------------------------------------------
const IconTarget = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="7.2" strokeDasharray="1.6 2.6" />
  </svg>
);
const IconTrophy = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 5H5v1.5a3 3 0 0 0 3 3" /><path d="M16 5h3v1.5a3 3 0 0 1-3 3" />
    <path d="M12 12v4" /><path d="M9.5 19.5h5" /><path d="M11 16h2v3.5h-2z" />
  </svg>
);
const IconQuest = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" />
  </svg>
);
const IconChevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9C5B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto' }}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export default function App() {
  const [gate, setGate] = useState({ state: 'loading' });
  const [auth, setAuth] = useState({ ready: false, session: null, myId: null, profile: null });
  const [toastData, setToastData] = useState({ msg: '', ts: 0 });
  const toast = useCallback((msg) => setToastData({ msg, ts: Date.now() }), []);

  // 누적 탭(=총 카운트) / 오늘·최고·연속(로컬 저장)
  const [total, setTotal] = useState(0);
  const [today, setToday] = useState(0);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bump, setBump] = useState(0);          // 숫자 pop 애니메이션 트리거
  const [delta24, setDelta24] = useState(0);     // 지난 24시간 증가분(세션 근사)
  const [friends, setFriends] = useState([]);    // [{ id, name, score }] — 실제 친구

  const localRef = useRef(null);                 // 로컬 통계 스냅샷
  const flushTimer = useRef(null);

  // ---- 로컬 통계 로드/증가 ----------------------------------------------
  const localLoad = useCallback((myId) => {
    let s = { date: todayKey(), today: 0, best: 0, streak: 0, lastActive: null };
    try {
      const raw = localStorage.getItem('tc:' + myId);
      if (raw) s = { ...s, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    if (s.date !== todayKey()) { s.date = todayKey(); s.today = 0; } // 날짜 바뀌면 오늘 리셋
    localRef.current = s;
    setToday(s.today); setBest(s.best); setStreak(s.streak);
  }, []);

  const localTick = useCallback((myId) => {
    const s = localRef.current || { date: todayKey(), today: 0, best: 0, streak: 0, lastActive: null };
    const tk = todayKey();
    if (s.date !== tk) { s.date = tk; s.today = 0; }
    // 연속: 오늘 첫 활동일 때 어제 활동했으면 +1, 아니면 1
    if (s.lastActive !== tk) {
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      s.streak = s.lastActive === y ? (s.streak || 0) + 1 : 1;
      s.lastActive = tk;
    }
    s.today += 1;
    if (s.today > s.best) s.best = s.today;
    localRef.current = s;
    try { localStorage.setItem('tc:' + myId, JSON.stringify(s)); } catch { /* ignore */ }
    setToday(s.today); setBest(s.best); setStreak(s.streak);
  }, []);

  // ---- 총 카운트 supabase 반영(디바운스) --------------------------------
  const scheduleFlush = useCallback((myId, value) => {
    if (previewMode) return; // 미리보기: 서버 저장 안 함
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      supabase.from('clicker_game_states').update({ coins: value }).eq('owner_id', myId)
        .then(({ error }) => { if (error) console.warn('[count]', error.message); });
    }, 800);
  }, []);

  // ---- 한 번의 탭(디바이스/화면 공통) ------------------------------------
  const tap = useCallback(() => {
    if (!auth.myId) return;
    setTotal((t) => { const nv = t + 1; scheduleFlush(auth.myId, nv); return nv; });
    setDelta24((d) => d + 1);
    localTick(auth.myId);
    setBump((b) => b + 1);
  }, [auth.myId, scheduleFlush, localTick]);

  // ---- 친구 점수 로드(친구 game_state 읽기는 RLS 허용) --------------------
  const loadFriends = useCallback(async (rawFriends) => {
    const list = (rawFriends || []).map((f) => ({ id: f.id, name: f.nickname || '친구', score: 0 }));
    if (!list.length) { setFriends([]); return; }
    const { data, error } = await supabase
      .from('clicker_game_states')
      .select('owner_id, coins')
      .in('owner_id', list.map((f) => f.id));
    if (error) { console.warn('[friends]', error.message); }
    else { const m = new Map((data || []).map((r) => [r.owner_id, r.coins || 0])); list.forEach((f) => { f.score = m.get(f.id) || 0; }); }
    setFriends(list);
  }, []);

  // 내 ESP32 기기 신호 → 탭
  const onDeviceSignal = useCallback(() => { tap(); }, [tap]);
  useRealtime({ myId: auth.myId, friends: [], onSignal: () => {}, onDeviceSignal });

  // ---- 부팅 / 인증 -------------------------------------------------------
  const fnError = useCallback(async (error, data, fallback) => {
    const str = (v) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
    if (data?.error) { console.error('[gate]', data.error); return str(data.error); }
    if (error?.context) {
      try { const j = await error.context.clone().json(); return str(j?.error ?? j?.message ?? fallback); } catch { /* ignore */ }
    }
    if (error) console.error('[gate]', error);
    return fallback;
  }, []);

  const bootRef = useRef(null);
  const register = useCallback(async () => {
    setGate({ state: 'loading', msg: '기기를 등록하는 중...' });
    const { data, error } = await deviceRegister();
    if (error || !data || !data.ok) { setGate({ state: 'error', msg: await fnError(error, data, '등록에 실패했어요.') }); return; }
    bootRef.current?.();
  }, [fnError]);

  const boot = useCallback(async () => {
    if (previewMode) { // 로그인 없이 로컬 미리보기
      setTotal(0);
      localLoad('preview');
      setAuth({ ready: true, session: null, myId: 'preview', profile: { nickname: '미리보기' } });
      setGate(null);
      setFriends([]);
      toast('미리보기 모드예요. 탭을 눌러보세요!');
      return;
    }
    if (!deviceCode) { setGate({ state: 'nocode' }); return; }
    setGate({ state: 'loading' });
    const { data: { session } } = await supabase.auth.getSession();
    const { data: res, error } = await deviceAuth();
    if (error || !res) { setGate({ state: 'error', msg: await fnError(error, res, '서버에 연결하지 못했어요.') }); return; }
    if (res.registered === false) {
      if (res.exists === false) { setGate({ state: 'notfound' }); return; }
      if (session) { setGate({ state: 'wifi' }); return; }
      setGate({ state: 'register' }); return;
    }
    if (res.needsLogin) { setGate({ state: 'login' }); return; }
    if (res.owner === false) { setGate({ state: 'owned' }); return; }

    const gs = res.gameState || {};
    setTotal(gs.coins || 0);
    localLoad(session.user.id);
    setAuth({ ready: true, session, myId: session.user.id, profile: res.profile });
    setGate(null);
    loadFriends(res.friends);
    toast(`${res.profile?.nickname || '반가워요'}, 탭을 시작하세요!`);
  }, [fnError, localLoad, loadFriends, toast]);
  bootRef.current = boot;

  useEffect(() => { boot(); /* eslint-disable-next-line */ }, []);

  // 이탈 시 마지막 값 저장
  useEffect(() => {
    const flush = () => {
      if (!auth.myId || previewMode) return;
      if (flushTimer.current) clearTimeout(flushTimer.current);
      supabase.from('clicker_game_states').update({ coins: total }).eq('owner_id', auth.myId);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [auth.myId, total]);

  const questPct = Math.min(100, Math.round((today / QUEST_GOAL) * 100));

  return (
    <>
      <Toast data={toastData} />

      {!gate && auth.ready && (
        <div className="tc">
          {/* 상단 바 */}
          <div className="tc-top">
            <div className="tc-icon"><IconTarget /></div>
            <div className="tc-brand">COUNTER</div>
            <div className="tc-icon"><IconTrophy /></div>
          </div>

          {/* 중앙: 랭킹 / 숫자 / 퀘스트 */}
          <div className="tc-mid">
            <div className="tc-rank">
              <span>글로벌 랭킹</span><span className="v">{RANK_LABEL}</span>
            </div>

            <button className="tc-tap" onClick={tap} aria-label="탭">
              <div key={bump} className="tc-number pop">{fmt(total)}</div>
              <div className="tc-delta">+{fmt(delta24)} · 지난 24시간</div>
            </button>

            <div className="tc-quest">
              <div className="tc-quest-ic"><IconQuest /></div>
              <div className="tc-quest-body">
                <div className="tc-quest-head">
                  <span className="t">오늘의 퀘스트 · {QUEST_GOAL}회 탭</span>
                  <span className="n">{today}/{QUEST_GOAL}</span>
                </div>
                <div className="tc-quest-bar"><div style={{ width: questPct + '%' }} /></div>
              </div>
              <IconChevron />
            </div>
          </div>

          {/* 친구 — 나 + 실제 친구를 점수순 정렬해 상위 5명 표시 */}
          <div className="tc-friends">
            <div className="tc-friends-head">
              <span>친구</span><span className="all">전체 ›</span>
            </div>
            <div className="tc-friends-row">
              {[{ id: 'me', name: '나', score: total, me: true }, ...friends]
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map((f) => (
                  <div className="tc-friend" key={f.id}>
                    <div className={'av' + (f.me ? ' me' : '')}>{f.me ? '나' : initial(f.name)}</div>
                    <div className={'sc' + (f.me ? ' me' : '')}>{fmt(f.score)}</div>
                  </div>
                ))}
            </div>
          </div>

          {/* 하단 통계 */}
          <div className="tc-stats">
            <div className="tc-stat"><div className="v">{fmt(today)}</div><div className="l">오늘</div></div>
            <div className="tc-stat-div" />
            <div className="tc-stat"><div className="v">{fmt(best)}</div><div className="l">최고</div></div>
            <div className="tc-stat-div" />
            <div className="tc-stat"><div className="v">{streak}일</div><div className="l">연속</div></div>
          </div>
        </div>
      )}

      {gate && (
        <Gate
          gate={gate}
          deviceCode={deviceCode}
          onGoogle={googleLogin}
          onStart={boot}
          onRegister={register}
          onRetry={boot}
          onLogout={async () => { await supabase.auth.signOut(); googleLogin(); }}
          onCopy={(s) => { try { navigator.clipboard.writeText(s); toast('기기 키를 복사했어요'); } catch (e) { /* ignore */ } }}
        />
      )}
    </>
  );
}
