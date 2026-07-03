import { useCallback, useEffect, useState } from 'react';
import { rankGet, rankSubmit } from '../lib/supabase';

const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP',
];
const fmt = (n) => (n || 0).toLocaleString('en-US');

// 주 마감까지 남은 시간 표시 (1초 틱)
function Countdown({ endIso }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!endIso) return null;
  const ms = Math.max(0, Date.parse(endIso) - Date.now());
  const d = Math.floor(ms / 86400000);
  const h = String(Math.floor(ms / 3600000) % 24).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return <span className="rk-count">{d > 0 ? `${d}일 ` : ''}{h}:{m}:{s}</span>;
}

function RankRows({ rows, myId }) {
  if (!rows.length) {
    return <div className="rk-empty">아직 등록된 기록이 없어요. 첫 주자가 되어보세요!</div>;
  }
  return rows.map((r, i) => (
    <div className={'rk-row' + (r.owner_id === myId ? ' me' : '')} key={r.owner_id}>
      <span className={'rk-no' + (i < 3 ? ' top' : '')}>{i + 1}</span>
      <span className="rk-name">{r.nickname || '익명'}</span>
      <span className="rk-mbti">{r.mbti}</span>
      <span className="rk-score">{fmt(r.score)}</span>
    </div>
  ));
}

export default function Ranking({ myId, total, previewMode, onClose, onMyRank, toast }) {
  const [tab, setTab] = useState('week');        // 'week' | 'mbti'
  const [data, setData] = useState(null);        // rank_get 응답
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);       // 등록 중
  const [mbti, setMbti] = useState(null);        // 선택한 MBTI(등록/조회용)
  const [picking, setPicking] = useState(false); // MBTI 선택 그리드 열림

  const load = useCallback(async (viewMbti) => {
    setLoading(true);
    const { data: res, error } = await rankGet(viewMbti);
    setLoading(false);
    if (error || !res?.ok) { toast('랭킹을 불러오지 못했어요'); return; }
    setData(res);
    if (!viewMbti) setMbti((m) => m || res.my_mbti);
    if (res.my?.rank) onMyRank?.(res.my.rank);
  }, [toast, onMyRank]);

  useEffect(() => { if (!previewMode) load(); }, [load, previewMode]);

  const submit = useCallback(async () => {
    if (!mbti) { setPicking(true); return; }
    setBusy(true);
    const { data: res, error } = await rankSubmit(mbti);
    setBusy(false);
    if (error || !res?.ok) { toast('기록 등록에 실패했어요'); return; }
    toast(`이번 주 기록 ${fmt(res.score)}탭 등록 완료!`);
    load(tab === 'mbti' ? mbti : undefined);
  }, [mbti, load, tab, toast]);

  const submitted = !!data?.my;
  const rows = tab === 'week' ? (data?.top ?? []) : (data?.mbti_top ?? []);

  return (
    <div className="col" onClick={onClose}>
      <div className="col-card rk-card" onClick={(e) => e.stopPropagation()}>
        <div className="col-head">
          <span className="t">주간 랭킹</span>
          {data && <Countdown endIso={data.week_end} />}
        </div>

        {/* 보상 안내 */}
        <div className="rk-prize">
          주간 랭킹이 끝나면 <b>🥇 1위 레어 뽑기권 ×1</b> · <b>🥈 2위 일반 뽑기권 ×1</b>을 드려요
        </div>

        {previewMode ? (
          <div className="rk-empty">미리보기 모드에서는 랭킹을 사용할 수 없어요</div>
        ) : (
          <>
            {/* 내 보유 뽑기권 */}
            {data && (
              <div className="rk-items">
                <span>내 뽑기권</span>
                <span className="v">레어 ×{data.items?.gacha_rare ?? 0} · 일반 ×{data.items?.gacha_normal ?? 0}</span>
              </div>
            )}

            {/* 기록 등록 */}
            <div className="rk-submit">
              <button className="rk-mbti-btn" onClick={() => setPicking((p) => !p)}>
                {mbti || 'MBTI 선택'}
              </button>
              <button className="gbtn rk-go" onClick={submit} disabled={busy || loading}>
                {busy ? '등록 중...' : submitted ? `기록 갱신 (${fmt(total)}탭)` : `내 기록 등록 (${fmt(total)}탭)`}
              </button>
            </div>
            {picking && (
              <div className="rk-mbti-grid">
                {MBTI_TYPES.map((t) => (
                  <button
                    key={t}
                    className={'rk-mbti-cell' + (mbti === t ? ' on' : '')}
                    onClick={() => { setMbti(t); setPicking(false); if (tab === 'mbti') load(t); }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {submitted && (
              <div className="rk-mine">
                내 순위 <b>#{data.my.rank}</b> · {data.my.mbti} 중 <b>#{data.my.mbti_rank}</b> · {fmt(data.my.score)}탭
              </div>
            )}

            {/* 탭: 주간 전체 / MBTI별 */}
            <div className="rk-tabs">
              <button className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>주간 전체</button>
              <button
                className={tab === 'mbti' ? 'on' : ''}
                onClick={() => { setTab('mbti'); if (mbti && data?.view_mbti !== mbti) load(mbti); }}
              >
                MBTI별{data?.view_mbti && tab === 'mbti' ? ` · ${data.view_mbti}` : ''}
              </button>
            </div>

            <div className="rk-list">
              {loading
                ? <div className="rk-empty">불러오는 중...</div>
                : tab === 'mbti' && !data?.view_mbti
                  ? <div className="rk-empty">MBTI를 선택하면 유형별 랭킹을 볼 수 있어요</div>
                  : <RankRows rows={rows} myId={myId} />}
            </div>
          </>
        )}

        <button className="gbtn ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
