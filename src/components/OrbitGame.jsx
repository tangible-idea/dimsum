import { useEffect, useRef } from 'react';
import { IconClose } from './icons';

// 딤섬 오빗 — 원버튼 방향 반전 게임.
//
// 실물 클리커는 60~110ms 지연이 있어 '순간 반응' 게임은 불가능하다.
// 그래서 실패가 순간이 아니라 경로에서 나오게 설계했다:
// - 먹이는 접시 위에 계속 남아 있다. 늦게 집어도 losses가 없다.
// - 장애물(고추)은 1.2초 동안 깜빡이며 예고한 뒤에야 위험해진다.
// - 최고 속도에서도 110ms 동안 이동하는 각도(~14°)가 장애물 폭보다 작다.
// 재는 것은 반응속도가 아니라 '어느 방향으로 돌아서 갈 것인가'다.

const BASE_SPEED = 1.5;      // rad/s
const MAX_SPEED = 2.2;       // 110ms에 약 14° — 히트박스 대비 안전
const TELEGRAPH_MS = 1200;   // 고추 예고 시간
const CHILI_LIFE_MS = 6000;  // 고추 유지 시간
const PLAYER_ARC = 0.16;     // 충돌 판정 반각(rad)
const FOOD_ARC = 0.22;       // 먹이 판정 반각 — 넉넉하게
const COMBO_MS = 2600;       // 이 안에 연속으로 먹으면 콤보

const FOODS = [
  { name: '하가우', fill: '#F6DFC0', edge: '#C99B6C', score: 10 },
  { name: '샤오마이', fill: '#EBC66D', edge: '#B98935', score: 10 },
  { name: '차슈바오', fill: '#F1BEA0', edge: '#B9785F', score: 10 },
];

const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
// 두 각도의 최단 거리
const angleGap = (a, b) => {
  const d = Math.abs(norm(a) - norm(b));
  return Math.min(d, TAU - d);
};

export default function OrbitGame({ myId, character, onExit }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bestKey = 'tc:orbit:' + myId;
    const mascot = new Image();
    mascot.src = character.img;
    let width = 0;
    let height = 0;
    let cx = 0;
    let cy = 0;
    let radius = 100;
    let raf = 0;
    let last = performance.now();

    const game = {
      state: 'ready',            // ready | run | over
      angle: -Math.PI / 2,
      dir: 1,
      speed: BASE_SPEED,
      score: 0,
      best: parseInt(localStorage.getItem(bestKey), 10) || 0,
      eaten: 0,
      combo: 0,
      lastEat: 0,
      foods: [],                 // { angle, kind }
      chilis: [],                // { angle, born, armAt, dieAt }
      pop: null,                 // { x, y, text, until } 점수 팝업
      paused: false,
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      cx = width / 2;
      cy = height / 2 + 14;
      radius = Math.min(width, height) * 0.34;
      const rotated = width > height && window.matchMedia('(pointer: coarse)').matches;
      game.paused = rotated;
    };

    // 플레이어·기존 개체와 겹치지 않는 각도 선정
    const freeAngle = (clearFromPlayer) => {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const angle = Math.random() * TAU;
        if (angleGap(angle, game.angle) < clearFromPlayer) continue;
        if (game.foods.some((f) => angleGap(angle, f.angle) < 0.5)) continue;
        if (game.chilis.some((c) => angleGap(angle, c.angle) < 0.6)) continue;
        return angle;
      }
      return null;
    };

    const spawnFood = () => {
      const angle = freeAngle(0.5);
      if (angle !== null) game.foods.push({ angle, kind: (Math.random() * FOODS.length) | 0 });
    };

    const spawnChili = (now) => {
      // 예고가 끝나는 순간 플레이어가 도달할 수 없는 위치는 없다 —
      // 지금 위치에서 예고시간 동안 최대 이동 각도만큼은 비워서 이유 없는 죽음을 막는다
      const unreachable = game.speed * (TELEGRAPH_MS / 1000) + PLAYER_ARC + 0.35;
      const angle = freeAngle(Math.min(unreachable, Math.PI * 0.8));
      if (angle !== null) {
        game.chilis.push({ angle, born: now, armAt: now + TELEGRAPH_MS, dieAt: now + TELEGRAPH_MS + CHILI_LIFE_MS });
      }
    };

    const reset = (now) => {
      game.angle = -Math.PI / 2;
      game.dir = 1;
      game.speed = BASE_SPEED;
      game.score = 0;
      game.eaten = 0;
      game.combo = 0;
      game.lastEat = 0;
      game.foods = [];
      game.chilis = [];
      game.pop = null;
      spawnFood(); spawnFood(); spawnFood();
      spawnChili(now);
    };

    const finish = () => {
      game.state = 'over';
      if (game.score > game.best) {
        game.best = game.score;
        try { localStorage.setItem(bestKey, String(game.score)); } catch { /* ignore */ }
      }
    };

    const input = () => {
      if (game.paused) return;
      const now = performance.now();
      if (game.state === 'ready') { game.state = 'run'; reset(now); return; }
      if (game.state === 'over') { game.state = 'run'; reset(now); return; }
      game.dir *= -1;
    };

    const step = (dt, now) => {
      if (game.state !== 'run' || game.paused) return;
      game.angle = norm(game.angle + game.dir * game.speed * dt);

      // 먹이 섭취 — 판정은 넉넉하게, 놓쳐도 사라지지 않는다
      for (let i = game.foods.length - 1; i >= 0; i -= 1) {
        if (angleGap(game.angle, game.foods[i].angle) < FOOD_ARC) {
          const food = game.foods.splice(i, 1)[0];
          game.combo = now - game.lastEat < COMBO_MS ? Math.min(5, game.combo + 1) : 1;
          game.lastEat = now;
          const gained = FOODS[food.kind].score * game.combo;
          game.score += gained;
          game.eaten += 1;
          game.speed = Math.min(MAX_SPEED, BASE_SPEED + game.eaten * 0.028);
          const px = cx + Math.cos(food.angle) * radius;
          const py = cy + Math.sin(food.angle) * radius;
          game.pop = { x: px, y: py - 26, text: `+${gained}${game.combo > 1 ? ' ×' + game.combo : ''}`, until: now + 700 };
          spawnFood();
          if (game.eaten % 4 === 0) spawnChili(now);
        }
      }

      // 고추 만료/충돌 — 예고 중에는 무해하다
      game.chilis = game.chilis.filter((c) => now < c.dieAt);
      for (const chili of game.chilis) {
        if (now >= chili.armAt && angleGap(game.angle, chili.angle) < PLAYER_ARC) { finish(); return; }
      }

      if (game.foods.length < 2) spawnFood();
    };

    const bun = (x, y, r, fill, edge) => {
      ctx.fillStyle = fill;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.86, y + r * 0.35);
      ctx.bezierCurveTo(x - r, y - r * 0.5, x - r * 0.42, y - r, x, y - r * 0.86);
      ctx.bezierCurveTo(x + r * 0.42, y - r, x + r, y - r * 0.5, x + r * 0.86, y + r * 0.35);
      ctx.bezierCurveTo(x + r * 0.62, y + r * 0.88, x - r * 0.62, y + r * 0.88, x - r * 0.86, y + r * 0.35);
      ctx.fill(); ctx.stroke();
    };

    const chiliShape = (x, y, ghost) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = ghost ? 0.4 + 0.3 * Math.sin(performance.now() * 0.012) : 1;
      ctx.fillStyle = '#C0503C';
      ctx.strokeStyle = '#8E3627';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 2, 7, 12, 0.5, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#5F7A44';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(4, -8); ctx.quadraticCurveTo(8, -14, 3, -16); ctx.stroke();
      ctx.restore();
    };

    const draw = (now) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#F6F5F0'; ctx.fillRect(0, 0, width, height);

      // HUD
      ctx.fillStyle = '#201E17';
      ctx.font = '700 24px "Space Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(game.score).padStart(5, '0'), cx, 52);
      ctx.fillStyle = '#B4B0A4';
      ctx.font = '400 10px "Space Mono", monospace';
      ctx.fillText('BEST ' + String(game.best).padStart(5, '0'), cx, 69);

      // 접시(트랙)
      ctx.strokeStyle = '#E4E1D8';
      ctx.lineWidth = 26;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#D8D4C6';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, radius - 13, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, radius + 13, 0, TAU); ctx.stroke();

      // 중앙 찜기 문양 + 마스코트
      ctx.strokeStyle = '#EBE9E1';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, radius * 0.46, 0, TAU); ctx.stroke();
      if (mascot.complete && mascot.naturalWidth) ctx.drawImage(mascot, cx - 21, cy - 21, 42, 42);

      // 먹이
      game.foods.forEach((food) => {
        const def = FOODS[food.kind];
        bun(cx + Math.cos(food.angle) * radius, cy + Math.sin(food.angle) * radius, 12, def.fill, def.edge);
      });

      // 고추 — 예고 중엔 깜빡, 활성화되면 선명
      game.chilis.forEach((chili) => {
        chiliShape(cx + Math.cos(chili.angle) * radius, cy + Math.sin(chili.angle) * radius, now < chili.armAt);
      });

      // 플레이어(회전 방향 표시 포함)
      const px = cx + Math.cos(game.angle) * radius;
      const py = cy + Math.sin(game.angle) * radius;
      ctx.fillStyle = 'rgba(78,51,25,.14)';
      ctx.beginPath(); ctx.ellipse(px + 2, py + 12, 12, 4, 0, 0, TAU); ctx.fill();
      bun(px, py, 15, '#FFF1C9', '#D5A64F');
      const ahead = game.angle + game.dir * 0.34;
      const ax = cx + Math.cos(ahead) * radius;
      const ay = cy + Math.sin(ahead) * radius;
      ctx.strokeStyle = '#B4B0A4';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px + (ax - px) * 0.45, py + (ay - py) * 0.45); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.fillStyle = '#B4B0A4';
      const tip = Math.atan2(ay - py, ax - px);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 7 * Math.cos(tip - 0.5), ay - 7 * Math.sin(tip - 0.5));
      ctx.lineTo(ax - 7 * Math.cos(tip + 0.5), ay - 7 * Math.sin(tip + 0.5));
      ctx.fill();

      // 점수 팝업
      if (game.pop && now < game.pop.until) {
        const t = 1 - (game.pop.until - now) / 700;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#201E17';
        ctx.font = '700 14px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(game.pop.text, game.pop.x, game.pop.y - t * 18);
        ctx.globalAlpha = 1;
      }

      if (game.state === 'ready' || game.state === 'over') {
        ctx.fillStyle = 'rgba(246,245,240,.88)';
        ctx.fillRect(0, 0, width, height);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#201E17';
        ctx.font = '700 24px "Apple SD Gothic Neo", sans-serif';
        ctx.fillText(game.state === 'ready' ? '딤섬 오빗' : '매운 고추를 밟았어요!', cx, height * 0.42);
        ctx.fillStyle = '#6A665A';
        ctx.font = '400 13px "Apple SD Gothic Neo", sans-serif';
        ctx.fillText(
          game.state === 'ready' ? '누르면 방향 반전 — 딤섬은 줍고 고추는 피해요' : `${game.score}점 · 눌러서 다시 도전`,
          cx, height * 0.42 + 27,
        );
        ctx.fillStyle = '#201E17';
        ctx.font = '700 11px "Space Mono", monospace';
        ctx.fillText(game.state === 'ready' ? 'TAP TO TURN' : 'TAP TO RETRY', cx, height * 0.42 + 58);
      }
    };

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt, now);
      draw(now);
      raf = requestAnimationFrame(frame);
    };

    const onPointer = (event) => { event.preventDefault(); input(); };
    const onKey = (event) => {
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); input(); }
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    window.addEventListener('dimsum:device-tap', input);
    canvas.addEventListener('pointerdown', onPointer);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dimsum:device-tap', input);
      canvas.removeEventListener('pointerdown', onPointer);
    };
  }, [character, myId]);

  return (
    <div className="mg">
      <canvas ref={canvasRef} className="mg-canvas" aria-label="딤섬 오빗 게임" />
      <button className="mg-exit" onClick={onExit} aria-label="게임 나가기" title="나가기"><IconClose size={18} /></button>
      <div className="mg-name">DIMSUM ORBIT</div>
    </div>
  );
}
