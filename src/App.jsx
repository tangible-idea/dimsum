import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceAuth, deviceCode, deviceRegister, googleLogin, previewMode, supabase } from './lib/supabase';
import { useRealtime } from './hooks/useRealtime';
import Gate from './components/Gate';

const fmt = (n) => (n || 0).toLocaleString('en-US');
const todayKey = () => new Date().toISOString().slice(0, 10);

// ---- 오늘의 퀘스트(날짜 기반 로테이션) ------------------------------------
const QUESTS = [
  { goal: 500, title: '500탭 챌린지' },
  { goal: 300, title: '가볍게 300탭' },
  { goal: 700, title: '탭 마라톤 700' },
  { goal: 400, title: '손끝 워밍업 400' },
  { goal: 600, title: '집중 스퍼트 600' },
];
const questOfDay = () => {
  let h = 0;
  for (const c of todayKey()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return QUESTS[h % QUESTS.length];
};

// ---- 수집 캐릭터(딤섬 프렌즈) ---------------------------------------------
const RARITY = {
  common: { label: '일반', weight: 70 },
  rare: { label: '희귀', weight: 25 },
  epic: { label: '전설', weight: 5 },
};
const A = (f) => `/assets/dimsum_${f}.png`;
const DIMSUM = [
  { id: 'har_gow', name: '하가우', rarity: 'common', src: A('har_gow') },
  { id: 'siu_mai', name: '슈마이', rarity: 'common', src: A('siu_mai') },
  { id: 'char_siu_bao', name: '차슈바오', rarity: 'common', src: A('char_siu_bao') },
  { id: 'baozi', name: '바오즈', rarity: 'common', src: A('baozi') },
  { id: 'bao_steamed', name: '찐빵이', rarity: 'common', src: A('bao_steamed') },
  { id: 'cheung_fun', name: '청펀', rarity: 'common', src: A('cheung_fun') },
  { id: 'gyoza', name: '교자', rarity: 'common', src: A('gyoza') },
  { id: 'pan_fried', name: '군만두', rarity: 'common', src: A('pan_fried_dumpling') },
  { id: 'spring_roll', name: '춘권이', rarity: 'common', src: A('spring_roll') },
  { id: 'egg_tart_small', name: '미니타르트', rarity: 'common', src: A('egg_tart_small') },
  { id: 'tea_cup_plain', name: '찻잔이', rarity: 'common', src: A('tea_cup_plain') },
  { id: 'bamboo_steamer', name: '대나무 찜기', rarity: 'common', src: A('bamboo_steamer_empty') },
  { id: 'chopsticks', name: '젓가락 형제', rarity: 'common', src: A('chopsticks') },
  { id: 'xiao_long_bao', name: '샤오롱바오', rarity: 'rare', src: A('xiao_long_bao') },
  { id: 'bao_sauce', name: '소스바오', rarity: 'rare', src: A('bao_sauce') },
  { id: 'egg_tart_large', name: '에그타르트', rarity: 'rare', src: A('egg_tart_large') },
  { id: 'noodle_bowl', name: '누들보울', rarity: 'rare', src: A('noodle_bowl') },
  { id: 'tofu_bowl', name: '두부보울', rarity: 'rare', src: A('tofu_bowl') },
  { id: 'tea_cup_floral', name: '꽃찻잔', rarity: 'rare', src: A('tea_cup_floral') },
  { id: 'teapot_small', name: '꼬마 티팟', rarity: 'rare', src: A('teapot_small') },
  { id: 'steamer_open', name: '열린 찜기', rarity: 'rare', src: A('steamer_open') },
  { id: 'teapot_pouring', name: '차 따르는 티팟', rarity: 'epic', src: A('teapot_pouring') },
  { id: 'teapot_ornate', name: '황금 티팟', rarity: 'epic', src: A('teapot_ornate') },
  { id: 'gaiwan', name: '가이완 도사', rarity: 'epic', src: A('gaiwan') },
];
const rollCharacter = () => {
  const r = Math.random() * 100;
  const tier = r < RARITY.epic.weight ? 'epic' : r < RARITY.epic.weight + RARITY.rare.weight ? 'rare' : 'common';
  const pool = DIMSUM.filter((d) => d.rarity === tier);
  return pool[Math.floor(Math.random() * pool.length)];
};

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

// 폭죽(컨페티) ----------------------------------------------------------------
const CONFETTI_COLORS = ['#E8B44F', '#D96C4A', '#7FA76B', '#5B8FB9', '#C9A0DC', '#E27D8E'];
function Confetti({ ts }) {
  const [pieces, setPieces] = useState([]);
  useEffect(() => {
    if (!ts) return undefined;
    setPieces(Array.from({ length: 90 }, (_, i) => ({
      id: `${ts}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      dur: 2.1 + Math.random() * 1.5,
      size: 6 + Math.random() * 6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      drift: (Math.random() * 2 - 1) * 140,
      spin: (Math.random() < 0.5 ? -1 : 1) * (420 + Math.random() * 640),
      round: Math.random() < 0.3,
    })));
    const t = setTimeout(() => setPieces([]), 4200);
    return () => clearTimeout(t);
  }, [ts]);
  if (!pieces.length) return null;
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            left: p.left + '%',
            width: p.size, height: p.size * (p.round ? 1 : 0.6),
            background: p.color,
            borderRadius: p.round ? '50%' : '1.5px',
            animationDuration: p.dur + 's',
            animationDelay: p.delay + 's',
            '--drift': p.drift + 'px',
            '--spin': p.spin + 'deg',
          }}
        />
      ))}
    </div>
  );
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
const IconGift = ({ size = 20, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="4" y="11" width="16" height="9" rx="1.6" />
    <rect x="3" y="7.5" width="18" height="3.5" rx="1" />
    <path d="M12 7.5V20" />
    <path d="M12 7.5c-2 0-4.2-.7-4.2-2.4C7.8 3.6 9.4 3 10.3 3.6c1 .6 1.7 2.4 1.7 3.9Z" />
    <path d="M12 7.5c2 0 4.2-.7 4.2-2.4 0-1.5-1.6-2.1-2.5-1.5-1 .6-1.7 2.4-1.7 3.9Z" />
  </svg>
);
const IconCheck = (p) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
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

  // 퀘스트 보상 / 캐릭터 수집
  const [claimed, setClaimed] = useState(false); // 오늘 보상 수령 여부
  const [collection, setCollection] = useState({}); // { charId: count }
  const [confettiTs, setConfettiTs] = useState(0);
  const [reward, setReward] = useState(null);    // { stage: 'box'|'open'|'reveal', char, isNew }
  const [showCol, setShowCol] = useState(false);
  const quest = questOfDay();

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
    setClaimed(s.claimed === todayKey());
    try { setCollection(JSON.parse(localStorage.getItem('tc:col:' + myId)) || {}); }
    catch { setCollection({}); }
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

  // ---- 퀘스트 달성 감지 → 폭죽 -------------------------------------------
  useEffect(() => {
    if (!auth.ready || !auth.myId) return;
    const s = localRef.current;
    if (!s || today < quest.goal || s.celebrated === todayKey()) return;
    s.celebrated = todayKey();
    try { localStorage.setItem('tc:' + auth.myId, JSON.stringify(s)); } catch { /* ignore */ }
    setConfettiTs(Date.now());
    toast('퀘스트 달성! 선물 상자를 열어보세요 🎁');
  }, [today, auth.ready, auth.myId, quest.goal, toast]);

  // ---- 보상 수령(선물상자 → 랜덤 캐릭터) ----------------------------------
  const questDone = today >= quest.goal;
  const onQuestClick = useCallback(() => {
    if (questDone && !claimed) setReward({ stage: 'box', char: null });
    else if (claimed) setShowCol(true);
  }, [questDone, claimed]);

  const openBox = useCallback(() => {
    const char = rollCharacter();
    const isNew = !collection[char.id];
    const s = localRef.current;
    if (s) {
      s.claimed = todayKey();
      try { localStorage.setItem('tc:' + auth.myId, JSON.stringify(s)); } catch { /* ignore */ }
    }
    setClaimed(true);
    setCollection((c) => {
      const nc = { ...c, [char.id]: (c[char.id] || 0) + 1 };
      try { localStorage.setItem('tc:col:' + auth.myId, JSON.stringify(nc)); } catch { /* ignore */ }
      return nc;
    });
    setReward({ stage: 'open', char, isNew });
    setTimeout(() => {
      setConfettiTs(Date.now());
      setReward({ stage: 'reveal', char, isNew });
    }, 750);
  }, [auth.myId, collection]);

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

  const questPct = Math.min(100, Math.round((today / quest.goal) * 100));
  const colCount = Object.keys(collection).length;

  return (
    <>
      <Toast data={toastData} />
      <Confetti ts={confettiTs} />

      {!gate && auth.ready && (
        <div className="tc">
          {/* 상단 바 */}
          <div className="tc-top">
            <div className="tc-icon"><IconTarget /></div>
            <div className="tc-brand">COUNTER</div>
            <button className="tc-icon tc-col-btn" onClick={() => setShowCol(true)} aria-label="캐릭터 도감">
              <IconTrophy />
              {colCount > 0 && <span className="tc-col-badge">{colCount}</span>}
            </button>
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

            <button
              className={'tc-quest' + (questDone ? (claimed ? ' claimed' : ' done') : '')}
              onClick={onQuestClick}
            >
              <div className="tc-quest-ic">
                {questDone && claimed ? <IconCheck /> : <IconGift />}
              </div>
              <div className="tc-quest-body">
                <div className="tc-quest-head">
                  <span className="t">
                    {questDone
                      ? (claimed ? '오늘 보상 수령 완료' : '퀘스트 달성! 🎉')
                      : `오늘의 퀘스트 · ${quest.title}`}
                  </span>
                  <span className="n">{Math.min(today, quest.goal)}/{quest.goal}</span>
                </div>
                {questDone && !claimed
                  ? <div className="tc-quest-cta">탭해서 선물 상자 열기</div>
                  : questDone && claimed
                    ? <div className="tc-quest-cta dim">내일 새로운 퀘스트가 열려요</div>
                    : <div className="tc-quest-bar"><div style={{ width: questPct + '%' }} /></div>}
              </div>
              <IconChevron />
            </button>
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

      {/* 보상: 선물상자 → 랜덤 딤섬 캐릭터 */}
      {reward && (
        <div className="rw" onClick={() => { if (reward.stage === 'reveal') setReward(null); }}>
          {reward.stage === 'box' && (
            <button className="rw-box" onClick={openBox} aria-label="선물 상자 열기">
              <div className="rw-gift wiggle"><IconGift size={96} /></div>
              <div className="rw-hint">선물 상자를 탭하세요</div>
            </button>
          )}
          {reward.stage === 'open' && (
            <div className="rw-box">
              <div className="rw-gift burst"><IconGift size={96} /></div>
            </div>
          )}
          {reward.stage === 'reveal' && (
            <div className="rw-card" onClick={(e) => e.stopPropagation()}>
              <div className="rw-glow" />
              <img className="rw-char" src={reward.char.src} alt={reward.char.name} />
              <div className={'rw-rarity ' + reward.char.rarity}>{RARITY[reward.char.rarity].label}</div>
              <div className="rw-name">{reward.char.name}</div>
              <div className="rw-sub">
                {reward.isNew ? '새로운 딤섬 프렌즈를 만났어요!' : `또 만났네요! (${collection[reward.char.id] || 1}번째)`}
              </div>
              <button className="gbtn" onClick={() => setReward(null)}>컬렉션에 담기</button>
            </div>
          )}
        </div>
      )}

      {/* 캐릭터 도감 */}
      {showCol && (
        <div className="col" onClick={() => setShowCol(false)}>
          <div className="col-card" onClick={(e) => e.stopPropagation()}>
            <div className="col-head">
              <span className="t">딤섬 프렌즈 도감</span>
              <span className="n">{colCount}/{DIMSUM.length}</span>
            </div>
            <div className="col-grid">
              {DIMSUM.map((d) => {
                const owned = collection[d.id] > 0;
                return (
                  <div className={'col-cell' + (owned ? '' : ' locked')} key={d.id}>
                    <div className={'col-img ' + d.rarity}>
                      {owned ? <img src={d.src} alt={d.name} /> : <span className="col-q">?</span>}
                      {collection[d.id] > 1 && <span className="col-cnt">×{collection[d.id]}</span>}
                    </div>
                    <div className="col-name">{owned ? d.name : '???'}</div>
                  </div>
                );
              })}
            </div>
            <button className="gbtn ghost" onClick={() => setShowCol(false)}>닫기</button>
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
