import { useMemo, useState } from 'react';
import { PALETTE, STAGES } from '../lib/pixels';
import {
  MAX_CAPTURES, loadCaptures, saveCaptures, loadSelectedId, saveSelectedId,
} from '../lib/collection';
import Capture from './Capture';
import DinoGame from './DinoGame';

// 게임 목록 — 새 게임은 여기에 추가
const GAMES = [
  {
    id: 'dino',
    name: '딤섬 러너',
    desc: '장애물을 폴짝! 실물 클리커 버튼으로도 점프해요',
    Component: DinoGame,
  },
];

// 기본 캐릭터(현재 딤섬이)를 dataURL 스프라이트로 래스터라이즈
const dimsumToDataUrl = (stageIdx, variant) => {
  const level = STAGES[stageIdx] || STAGES[0];
  const stage = level.variants[variant] || level.variants[0];
  const map = stage.map;
  const w = map[0].length;
  const h = map.length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  map.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = stage.palette?.[ch] || PALETTE[ch];
    if (ch !== '.' && c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
  }));
  return { img: cv.toDataURL('image/png'), w, h, name: stage.name };
};

// 클리커 아케이드 — 실물 클리커 콜렉션 + 미니게임 허브
export default function Arcade({ myId, stageIdx, variant, toast, onClose }) {
  const [captures, setCaptures] = useState(() => loadCaptures(myId));
  const [selectedId, setSelectedId] = useState(() => loadSelectedId(myId));
  const [adding, setAdding] = useState(false);
  const [playing, setPlaying] = useState(null); // 게임 id

  const defaultChar = useMemo(() => dimsumToDataUrl(stageIdx, variant), [stageIdx, variant]);
  const selected = captures.find((c) => c.id === selectedId) || null;
  const player = selected || defaultChar; // 출전 캐릭터

  const select = (id) => {
    setSelectedId(id);
    saveSelectedId(myId, id);
  };

  const remove = (id) => {
    const next = captures.filter((c) => c.id !== id);
    setCaptures(next);
    saveCaptures(myId, next);
    if (selectedId === id) select(null);
    toast('콜렉션에서 뺐어요');
  };

  const onSaved = (cap) => {
    const next = [...captures, cap];
    setCaptures(next);
    saveCaptures(myId, next);
    select(cap.id);
    setAdding(false);
    toast(`${cap.name} 입단! 게임에 출전할 수 있어요`);
  };

  const game = GAMES.find((gm) => gm.id === playing);
  if (game) {
    return <game.Component myId={myId} character={player} onExit={() => setPlaying(null)} />;
  }

  return (
    <>
      <div className="col" onClick={onClose}>
        <div className="col-card" onClick={(e) => e.stopPropagation()}>
          <div className="col-head">
            <span className="t">클리커 아케이드</span>
            <span className="n">{captures.length}/{MAX_CAPTURES}</span>
          </div>

          {/* 출전 캐릭터 */}
          <div className="col-fit">
            <img className="ac-hero" src={player.img} alt="" />
            <div className="col-fit-txt">
              <b>{player.name}</b>
              <span>게임에 출전하는 캐릭터예요. 탭해서 바꿔보세요</span>
            </div>
          </div>

          <div className="ac-lbl">내 캐릭터</div>
          <div className="col-grid ac-grid">
            {/* 기본: 지금 키우는 딤섬이 */}
            <button
              className={'col-cell' + (!selected ? ' wearing' : '')}
              onClick={() => select(null)}
            >
              <div className="col-img">
                <img className="ac-cap" src={defaultChar.img} alt="" />
                {!selected && <span className="col-on">출전</span>}
              </div>
              <div className="col-name">딤섬이</div>
            </button>

            {captures.map((c) => (
              <div
                className={'col-cell' + (selectedId === c.id ? ' wearing' : '')}
                key={c.id}
                onClick={() => select(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') select(c.id); }}
              >
                <div className="col-img">
                  <img className="ac-cap" src={c.img} alt={c.name} />
                  {selectedId === c.id && <span className="col-on">출전</span>}
                  <button
                    className="ac-del"
                    aria-label={`${c.name} 삭제`}
                    onClick={(e) => { e.stopPropagation(); remove(c.id); }}
                  >
                    ✕
                  </button>
                </div>
                <div className="col-name">{c.name}</div>
              </div>
            ))}

            {captures.length < MAX_CAPTURES && (
              <button className="col-cell ac-add" onClick={() => setAdding(true)}>
                <div className="col-img"><span className="ac-plus">＋</span></div>
                <div className="col-name">사진으로 추가</div>
              </button>
            )}
          </div>

          <div className="ac-lbl">게임</div>
          {GAMES.map((gm) => (
            <button className="ac-game" key={gm.id} onClick={() => setPlaying(gm.id)}>
              <img className="ac-game-ic" src={player.img} alt="" />
              <span className="ac-game-txt">
                <b>{gm.name}</b>
                <span>{gm.desc}</span>
              </span>
              <span className="ac-game-go">PLAY</span>
            </button>
          ))}

          <button className="gbtn ghost" onClick={onClose}>닫기</button>
        </div>
      </div>

      {adding && (
        <Capture
          count={captures.length}
          toast={toast}
          onSaved={onSaved}
          onCancel={() => setAdding(false)}
        />
      )}
    </>
  );
}
