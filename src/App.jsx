import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceAuth, deviceCode, deviceRegister, googleLogin, previewMode, supabase } from './lib/supabase';
import { useRealtime } from './hooks/useRealtime';
import Gate from './components/Gate';
import Ranking from './components/Ranking';
import PixelDimsum, { Sprite } from './components/PixelDimsum';
import { ACCESSORIES, ACC_RARITY, STAGES, rollAccessory, stageOf } from './lib/pixels';
import { CONSUMABLES, CONSUMABLE_BY_ID, EVOLUTION_FOOD, EVOLUTION_HINT, STARTER_FRIDGE, consumableSrc } from './lib/consumables';

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

const initial = (name) => ([...(name || '?')][0] || '?').toUpperCase();

// 성장 진행도(수치는 숨김) → 말로만 표현. 10% 구간마다 다른 문구.
const GROWTH_PHRASES = [
  '이제 막 성장을 시작했어요',
  '열심히 성장이 필요해요',
  '오늘도 노력해봐요',
  '한 탭 한 탭 자라는 중이에요',
  '다음 성장까지 힘내요',
  '벌써 절반쯤 자란 것 같아요',
  '성장 기운이 스멀스멀 느껴져요',
  '쑥쑥! 잘 크고 있어요',
  '거의 다 왔어요, 조금만 더!',
  '다음 성장이 거의 다 왔어요',
];
const growthPhrase = (pct) => GROWTH_PHRASES[Math.max(0, Math.min(9, Math.floor(pct / 10)))];

// 잘못된 재료를 먹였을 때(재료는 소모됨)
const FEED_FAIL_PHRASES = [
  '이게 아닌 것 같아요..ㅜ',
  '으엑… 이 맛이 아니에요',
  '냠냠… 근데 아무 일도 없어요?',
  '맛은 있는데 진화는 안 되나 봐요',
  '음… 뭔가 다른 게 먹고 싶어요',
];
const SLOT_LABEL = { head: '머리', face: '얼굴', neck: '목' };

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

// 아이콘 ----------------------------------------------------------------------
const IconShirt = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M9 4 4.5 6.5 3 10l3 1.2V20h12v-8.8L21 10l-1.5-3.5L15 4" />
    <path d="M9 4a3 3 0 0 0 6 0" />
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
const IconFridge = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="6" y="3" width="12" height="18" rx="2" />
    <path d="M6 10h12" /><path d="M9 6.5v1.5" /><path d="M9 13v3" />
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
  const [bump, setBump] = useState(0);          // 점프/숫자 애니메이션 트리거
  const [delta24, setDelta24] = useState(0);     // 지난 24시간 증가분(세션 근사)
  const [friends, setFriends] = useState([]);    // [{ id, name, score }] — 실제 친구

  // 퀘스트 보상 / 악세서리 옷장
  const [claimed, setClaimed] = useState(false); // 오늘 보상 수령 여부
  const [closet, setCloset] = useState({});      // { accId: count }
  const [equipped, setEquipped] = useState({});  // { head, face, neck }
  const [confettiTs, setConfettiTs] = useState(0);
  const [reward, setReward] = useState(null);    // { stage: 'box'|'open'|'reveal', acc, isNew }
  const [showCol, setShowCol] = useState(false);
  const [showRank, setShowRank] = useState(false); // 주간 랭킹 패널
  const [myRank, setMyRank] = useState(null);      // 이번 주 내 순위(등록 시)

  // 냉장고(소비 아이템) / 성장 단계(먹이 진화)
  const [fridge, setFridge] = useState({});        // { itemId: count }
  const [showFridge, setShowFridge] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);     // 먹이를 먹어야 다음 단계로 진화
  const quest = questOfDay();

  const localRef = useRef(null);                 // 로컬 통계 스냅샷
  const flushTimer = useRef(null);

  // ---- 로컬 통계 로드/증가 ----------------------------------------------
  const localLoad = useCallback((myId, totalNow) => {
    let s = { date: todayKey(), today: 0, best: 0, streak: 0, lastActive: null };
    try {
      const raw = localStorage.getItem('tc:' + myId);
      if (raw) s = { ...s, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    if (s.date !== todayKey()) { s.date = todayKey(); s.today = 0; } // 날짜 바뀌면 오늘 리셋
    localRef.current = s;
    setToday(s.today); setBest(s.best); setStreak(s.streak);
    setClaimed(s.claimed === todayKey());
    try { setCloset(JSON.parse(localStorage.getItem('tc:acc:' + myId)) || {}); }
    catch { setCloset({}); }
    try { setEquipped(JSON.parse(localStorage.getItem('tc:eq:' + myId)) || {}); }
    catch { setEquipped({}); }
    // 냉장고: 처음이면 기본 아이템 지급
    let fr = null;
    try { fr = JSON.parse(localStorage.getItem('tc:fr:' + myId)); } catch { /* ignore */ }
    if (!fr) {
      fr = { ...STARTER_FRIDGE };
      try { localStorage.setItem('tc:fr:' + myId, JSON.stringify(fr)); } catch { /* ignore */ }
    }
    setFridge(fr);
    // 성장 단계: 저장값 없으면(기존 유저) 탭수 기준으로 초기화
    let st = parseInt(localStorage.getItem('tc:st:' + myId), 10);
    if (Number.isNaN(st)) st = stageOf(totalNow || 0);
    setStageIdx(Math.min(st, STAGES.length - 1));
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

  // ---- 한 번의 탭(디바이스/화면 공통) → 딤섬 점프 -------------------------
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

  // ---- 보상 수령(선물상자 → 랜덤 악세서리) --------------------------------
  const questDone = today >= quest.goal;
  const onQuestClick = useCallback(() => {
    if (questDone && !claimed) setReward({ stage: 'box', acc: null });
    else if (claimed) setShowCol(true);
  }, [questDone, claimed]);

  const openBox = useCallback(() => {
    const acc = rollAccessory();
    const isNew = !closet[acc.id];
    const s = localRef.current;
    if (s) {
      s.claimed = todayKey();
      try { localStorage.setItem('tc:' + auth.myId, JSON.stringify(s)); } catch { /* ignore */ }
    }
    setClaimed(true);
    setCloset((c) => {
      const nc = { ...c, [acc.id]: (c[acc.id] || 0) + 1 };
      try { localStorage.setItem('tc:acc:' + auth.myId, JSON.stringify(nc)); } catch { /* ignore */ }
      return nc;
    });
    setReward({ stage: 'open', acc, isNew });
    setTimeout(() => {
      setConfettiTs(Date.now());
      setReward({ stage: 'reveal', acc, isNew });
    }, 750);
  }, [auth.myId, closet]);

  // ---- 착용/해제 -----------------------------------------------------------
  const toggleEquip = useCallback((acc) => {
    setEquipped((eq) => {
      const wearing = eq[acc.slot] === acc.id;
      const ne = { ...eq, [acc.slot]: wearing ? null : acc.id };
      try { localStorage.setItem('tc:eq:' + auth.myId, JSON.stringify(ne)); } catch { /* ignore */ }
      return ne;
    });
  }, [auth.myId]);

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
      localLoad('preview', 0);
      setAuth({ ready: true, session: null, myId: 'preview', profile: { nickname: '미리보기' } });
      setGate(null);
      setFriends([]);
      toast('미리보기 모드예요. 딤섬이를 탭해보세요!');
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
    localLoad(session.user.id, gs.coins || 0);
    setAuth({ ready: true, session, myId: session.user.id, profile: res.profile });
    setGate(null);
    loadFriends(res.friends);
    toast(`${res.profile?.nickname || '반가워요'}, 딤섬이를 키워보세요!`);
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
  const closetCount = Object.keys(closet).length;

  // 성장 단계: 탭 조건 충족 후 진화 재료를 먹이면 다음 단계로
  const stage = STAGES[stageIdx];
  const nextStage = STAGES[stageIdx + 1];
  const needFood = nextStage ? CONSUMABLE_BY_ID[EVOLUTION_FOOD[stageIdx]] : null;
  const growReady = !!nextStage && total >= nextStage.min;
  const growPct = nextStage
    ? Math.max(0, Math.min(100, Math.round(((total - stage.min) / (nextStage.min - stage.min)) * 100)))
    : 100;

  // ---- 먹이기: 냉장고에서 직접 고른 재료가 정답이면 진화, 오답이면 소모만 --
  const feedItem = (c) => {
    if (!nextStage || !needFood || !growReady || (fridge[c.id] || 0) <= 0) return;
    setFridge((f) => {
      const nf = { ...f, [c.id]: Math.max(0, (f[c.id] || 0) - 1) };
      try { localStorage.setItem('tc:fr:' + auth.myId, JSON.stringify(nf)); } catch { /* ignore */ }
      return nf;
    });
    if (c.id !== needFood.id) {
      toast(FEED_FAIL_PHRASES[Math.floor(Math.random() * FEED_FAIL_PHRASES.length)]);
      return;
    }
    const ni = stageIdx + 1;
    setStageIdx(ni);
    try { localStorage.setItem('tc:st:' + auth.myId, String(ni)); } catch { /* ignore */ }
    setShowFridge(false);
    setConfettiTs(Date.now());
    toast(`${c.name} 냠냠! ${STAGES[ni].name}(으)로 진화했어요! 🎉`);
  };

  return (
    <>
      <Toast data={toastData} />
      <Confetti ts={confettiTs} />

      {!gate && auth.ready && (
        <div className="tc">
          {/* 상단 바 */}
          <div className="tc-top">
            <button className="tc-icon tc-col-btn" onClick={() => setShowCol(true)} aria-label="악세서리 옷장">
              <IconShirt />
              {closetCount > 0 && <span className="tc-col-badge">{closetCount}</span>}
            </button>
            <div className="tc-brand">DIMSUM PET</div>
            <div className="tc-actions">
              <button className="tc-icon" onClick={() => setShowFridge(true)} aria-label="냉장고">
                <IconFridge />
              </button>
              <button className="tc-icon" onClick={() => setShowRank(true)} aria-label="주간 랭킹">
                <IconTrophy />
              </button>
            </div>
          </div>

          {/* 중앙: 랭킹 / 딤섬 다마고치 / 퀘스트 */}
          <div className="tc-mid">
            <button className="tc-rank" onClick={() => setShowRank(true)}>
              <span>주간 랭킹</span>
              <span className="v">{myRank ? `#${myRank}` : '기록 등록하고 뽑기권 받기 →'}</span>
            </button>

            <button className="dj-zone" onClick={tap} aria-label="딤섬이 탭">
              <div className="dj-count">
                <span key={bump} className="n pop">{fmt(total)}</span>
                <span className="d">+{fmt(delta24)} · 24h</span>
              </div>
              <div className="dj-arena">
                <div key={bump} className={'dj-jump' + (bump ? ' go' : '')}>
                  <div className="dj-idle">
                    <PixelDimsum stageIdx={stageIdx} equipped={equipped} />
                  </div>
                </div>
                <div key={'s' + bump} className={'dj-shadow' + (bump ? ' go' : '')} />
              </div>
              <div className="dj-meta">
                <span className="s">{stage.name}</span>
              </div>
            </button>

            {/* 성장 버튼: 수치·프로그레스 없이 문구로만. 누르면 냉장고에서 재료 선택 */}
            <button
              className={'dj-grow' + (growReady ? ' ready' : '') + (nextStage ? '' : ' max')}
              onClick={() => { if (nextStage) setShowFridge(true); }}
              disabled={!nextStage}
            >
              {!nextStage ? (
                <span className="t">최고 단계 달성! 🏆</span>
              ) : growReady ? (
                <span className="t">배가 고픈가 봐요! 먹이를 골라주세요 🍽️</span>
              ) : (
                <span className="lbl">{growthPhrase(growPct)}</span>
              )}
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
                  ? <div className="tc-quest-cta">탭해서 악세서리 상자 열기</div>
                  : questDone && claimed
                    ? <div className="tc-quest-cta dim">내일 새로운 퀘스트가 열려요</div>
                    : <div className="tc-quest-bar"><div style={{ width: questPct + '%' }} /></div>}
              </div>
              <IconChevron />
            </button>
          </div>

          {/* 친구 — 슬림 스트립(나 + 친구, 점수순 상위 5) */}
          <div className="tc-friends">
            <span className="tc-friends-lbl">친구</span>
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

      {/* 보상: 선물상자 → 랜덤 악세서리 */}
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
              <div className="rw-char rw-acc">
                <Sprite
                  map={reward.acc.map}
                  px={Math.max(8, Math.floor(120 / reward.acc.map[0].length))}
                />
              </div>
              <div className={'rw-rarity ' + reward.acc.rarity}>
                {ACC_RARITY[reward.acc.rarity].label} · {SLOT_LABEL[reward.acc.slot]}
              </div>
              <div className="rw-name">{reward.acc.name}</div>
              <div className="rw-sub">
                {reward.isNew ? '새로운 악세서리를 얻었어요!' : `또 얻었네요! (${closet[reward.acc.id] || 1}개째)`}
              </div>
              <button
                className="gbtn"
                onClick={() => { toggleEquip(reward.acc); setReward(null); toast(`${reward.acc.name} 착용!`); }}
              >
                바로 착용하기
              </button>
              <button className="gbtn ghost" onClick={() => setReward(null)}>옷장에 넣기</button>
            </div>
          )}
        </div>
      )}

      {/* 악세서리 옷장(탭하면 착용/해제) */}
      {showCol && (
        <div className="col" onClick={() => setShowCol(false)}>
          <div className="col-card" onClick={(e) => e.stopPropagation()}>
            <div className="col-head">
              <span className="t">딤섬이 옷장</span>
              <span className="n">{closetCount}/{ACCESSORIES.length}</span>
            </div>
            <div className="col-fit">
              <PixelDimsum stageIdx={stageIdx} equipped={equipped} px={6} />
              <div className="col-fit-txt">
                <b>{stage.name}</b>
                <span>보유한 악세서리를 탭하면 바로 입어봐요</span>
              </div>
            </div>
            <div className="col-grid">
              {ACCESSORIES.map((a) => {
                const owned = closet[a.id] > 0;
                const wearing = equipped[a.slot] === a.id;
                return (
                  <button
                    className={'col-cell' + (owned ? '' : ' locked') + (wearing ? ' wearing' : '')}
                    key={a.id}
                    onClick={() => { if (owned) toggleEquip(a); }}
                    disabled={!owned}
                  >
                    <div className={'col-img ' + a.rarity}>
                      {owned
                        ? <Sprite map={a.map} px={6} style={{ width: '72%', height: '58%' }} />
                        : <span className="col-q">?</span>}
                      {closet[a.id] > 1 && <span className="col-cnt">×{closet[a.id]}</span>}
                      {wearing && <span className="col-on">착용</span>}
                    </div>
                    <div className="col-name">{owned ? a.name : '???'}</div>
                  </button>
                );
              })}
            </div>
            <button className="gbtn ghost" onClick={() => setShowCol(false)}>닫기</button>
          </div>
        </div>
      )}

      {/* 주간/MBTI 랭킹 */}
      {showRank && (
        <Ranking
          myId={auth.myId}
          total={total}
          previewMode={previewMode}
          onClose={() => setShowRank(false)}
          onMyRank={setMyRank}
          toast={toast}
        />
      )}

      {/* 냉장고(소비 아이템) — 진화 재료 먹이기 */}
      {showFridge && (
        <div className="col" onClick={() => setShowFridge(false)}>
          <div className="col-card" onClick={(e) => e.stopPropagation()}>
            <div className="col-head">
              <span className="t">딤섬이 냉장고</span>
              <span className="n">{Object.values(fridge).reduce((a, b) => a + (b || 0), 0)}개 보유</span>
            </div>
            {nextStage && (
              <div className="fr-need">
                <div className="fr-need-txt">
                  {growReady ? (
                    <>
                      <b>진화 준비 완료! 먹이를 직접 골라보세요</b>
                      <span>힌트: {EVOLUTION_HINT[stageIdx]}</span>
                    </>
                  ) : (
                    <>
                      <b>{growthPhrase(growPct)}</b>
                      <span>아직은 먹일 수 없어요. 조금 더 자란 뒤에 다시 와요!</span>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="col-grid fr-grid">
              {CONSUMABLES.map((c) => {
                const cnt = fridge[c.id] || 0;
                const feedable = growReady && cnt > 0; // 어떤 재료든 먹일 수 있음(오답은 소모만)
                return (
                  <button
                    key={c.id}
                    className={'col-cell' + (cnt > 0 ? '' : ' locked') + (feedable ? ' feedable' : '')}
                    onClick={() => { if (feedable) feedItem(c); }}
                    disabled={!feedable}
                  >
                    <div className="col-img fr-img">
                      <img src={consumableSrc(c)} alt={c.name} />
                      {cnt > 0 && <span className="col-cnt">×{cnt}</span>}
                    </div>
                    <div className="col-name">{c.name}</div>
                  </button>
                );
              })}
            </div>
            <button className="gbtn ghost" onClick={() => setShowFridge(false)}>닫기</button>
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
