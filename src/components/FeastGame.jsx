import { useCallback, useEffect, useRef, useState } from 'react';
import { IconClose } from './icons';

// 딤섬이 배 채우기 — 버튼 하나로만 하는 푸시 유어 럭.
//
// 입력이 '탭' 한 종류뿐이라는 제약에서 출발했다. 기기는 누름 이벤트만
// 보내고 길게 누름이나 지속시간이 없다. 그래서 '한 번 더 먹기'만 탭에
// 걸고, '그만 먹기'는 누르지 않는 것으로 표현한다.
//
// 반응속도는 전혀 필요 없다. 카운트다운은 2.4초로 넉넉하고, 남은 시간이
// 링으로 계속 보이므로 놀랄 일이 없다. 재는 것은 손이 아니라 판단이다.

const TARGET = 100;
const ROUNDS = 3;
const STOP_MS = 2400;      // 이만큼 안 누르면 '그만 먹기'
const BITE_MIN = 6;
const BITE_MAX = 21;
const RESULT_MS = 1400;    // 라운드 결과를 보여주는 시간

const bite = () => BITE_MIN + Math.floor(Math.random() * (BITE_MAX - BITE_MIN + 1));

export default function FeastGame({ myId, character, onExit }) {
  const bestKey = 'tc:feast:' + myId;
  const [round, setRound] = useState(1);
  const [fill, setFill] = useState(0);
  const [scores, setScores] = useState([]);
  const [phase, setPhase] = useState('eating');   // eating | result | over
  const [left, setLeft] = useState(1);            // 카운트다운 잔량 0~1
  const [best, setBest] = useState(() => {
    const v = parseInt(localStorage.getItem('tc:feast:' + myId), 10);
    return Number.isNaN(v) ? 0 : v;
  });

  const fillRef = useRef(0);
  const deadlineRef = useRef(0);
  const rafRef = useRef(0);
  const timerRef = useRef(null);
  const settlingRef = useRef(false);
  const phaseRef = useRef('eating');
  phaseRef.current = phase;

  const total = scores.reduce((a, b) => a + b, 0);

  // 라운드 종료 → 점수 확정
  const settle = useCallback((busted) => {
    if (settlingRef.current) return;
    settlingRef.current = true;
    cancelAnimationFrame(rafRef.current);
    clearTimeout(timerRef.current);
    const got = busted ? 0 : fillRef.current;
    setScores((s) => {
      const next = [...s, got];
      if (next.length >= ROUNDS) {
        const sum = next.reduce((a, b) => a + b, 0);
        setBest((prevBest) => {
          if (sum > prevBest) {
            try { localStorage.setItem(bestKey, String(sum)); } catch { /* ignore */ }
            return sum;
          }
          return prevBest;
        });
      }
      return next;
    });
    setPhase('result');
    timerRef.current = setTimeout(() => {
      setRound((r) => {
        if (r >= ROUNDS) { setPhase('over'); return r; }
        fillRef.current = 0;
        settlingRef.current = false;
        setFill(0);
        setPhase('eating');
        return r + 1;
      });
    }, RESULT_MS);
  }, [bestKey]);

  // '그만 먹기' 카운트다운. 탭할 때마다 처음부터 다시 센다.
  const armCountdown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    deadlineRef.current = performance.now() + STOP_MS;
    const tick = () => {
      const remain = deadlineRef.current - performance.now();
      if (remain <= 0) { setLeft(0); settle(false); return; }
      setLeft(remain / STOP_MS);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [settle]);

  const eat = useCallback(() => {
    if (phaseRef.current !== 'eating') return;
    const next = fillRef.current + bite();
    fillRef.current = next;
    setFill(next);
    if (next > TARGET) { settle(true); return; }   // 배탈
    armCountdown();
  }, [armCountdown, settle]);

  // 화면 탭 / 스페이스 / 실물 클리커 버튼 — 전부 같은 '한 입'
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); eat(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('dimsum:device-tap', eat);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dimsum:device-tap', eat);
    };
  }, [eat]);

  // 라운드가 시작되면 첫 입을 기다린다(카운트다운은 첫 탭부터)
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(timerRef.current);
  }, []);

  const restart = () => {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(timerRef.current);
    fillRef.current = 0;
    settlingRef.current = false;
    setFill(0); setScores([]); setRound(1); setPhase('eating'); setLeft(1);
  };

  const busted = fill > TARGET;
  const pct = Math.min(100, (fill / TARGET) * 100);
  const eating = phase === 'eating';
  const counting = eating && fill > 0;

  return (
    <div className="fg" onPointerDown={eating ? eat : undefined}>
      <div className="fg-top">
        <button
          className="fg-exit"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onExit}
          aria-label="게임 나가기" title="나가기"
        >
          <IconClose size={18} />
        </button>
        <div className="fg-stats">
          <span>{round}/{ROUNDS}라운드</span>
          <span>합계 <b>{total}</b></span>
          {best > 0 && <span className="dim">최고 <b>{best}</b></span>}
        </div>
      </div>

      <div className="fg-stage">
        <div className={'fg-num' + (busted ? ' bust' : '')}>
          {fill}<i>/{TARGET}</i>
        </div>

        <div className="fg-bar">
          <div className="fg-bar-fill" style={{ width: pct + '%' }} />
        </div>

        <div className={'fg-char' + (busted ? ' bust' : '') + (counting ? ' munch' : '')}>
          <img src={character.img} alt="" />
        </div>

        {/* 남은 시간을 링으로 계속 보여준다 — 갑자기 끝나면 안 된다 */}
        {counting && (
          <div className="fg-ring" style={{ '--left': left }}>
            <span>그만 먹기까지</span>
          </div>
        )}

        {eating && fill === 0 && (
          <p className="fg-hint">눌러서 한 입 — 그만 누르면 그대로 확정돼요</p>
        )}
        {phase === 'result' && (
          <p className={'fg-result' + (busted ? ' bust' : '')}>
            {busted ? '배탈이에요… 0점' : `${fill}점!`}
          </p>
        )}
      </div>

      {phase === 'over' && (
        <div className="fg-over" onPointerDown={(e) => e.stopPropagation()}>
          <b>합계 {total}점</b>
          <span>
            {scores.join(' + ')}
            {total >= best && total > 0 ? ' · 최고 기록! 🎉' : ''}
          </span>
          <div className="fg-over-btns">
            <button className="gbtn ghost" onClick={onExit}>나가기</button>
            <button className="gbtn" onClick={restart}>다시 하기</button>
          </div>
        </div>
      )}
    </div>
  );
}
