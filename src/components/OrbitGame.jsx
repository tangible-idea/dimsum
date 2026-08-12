import { useEffect, useRef } from 'react';
import { IconClose } from './icons';

// 딤섬 오빗 — 원버튼 방향 반전 게임, 우주 라운드제.
//
// 수금지화목토천해 8개 행성을 궤도 삼아 돈다. 행성마다 목표 개수를
// 채우면 다음 행성으로 워프하고, 갈수록 빨라지고 고추가 많아진다.
//
// 실물 클리커는 60~110ms 지연이 있어 '순간 반응' 게임은 불가능하다.
// 그래서 실패가 순간이 아니라 경로에서 나오게 설계했다:
// - 먹이는 궤도 위에 계속 남아 있다. 늦게 집어도 손해가 없다.
// - 장애물(고추)은 예고 시간 동안 깜빡인 뒤에야 위험해진다(최소 0.95초).
// - 마지막 행성의 최고 속도에서도 110ms 이동각(~15°)이 판정 폭보다 작다.

const PLANETS = [
  { name: '수성', body: '#B9AFA4', detail: '#8E8377', goal: 5, speed: 1.35, chilis: 1, telegraph: 1250 },
  { name: '금성', body: '#E3B96F', detail: '#C29347', goal: 6, speed: 1.45, chilis: 1, telegraph: 1200 },
  { name: '지구', body: '#5B8FB9', detail: '#7FA76B', goal: 7, speed: 1.55, chilis: 2, telegraph: 1150 },
  { name: '화성', body: '#C96F4A', detail: '#9E4E31', goal: 8, speed: 1.65, chilis: 2, telegraph: 1100 },
  { name: '목성', body: '#D9A876', detail: '#B07E4E', goal: 9, speed: 1.75, chilis: 3, telegraph: 1050 },
  { name: '토성', body: '#E0C48C', detail: '#B79A5E', goal: 10, speed: 1.85, chilis: 3, telegraph: 1000 },
  { name: '천왕성', body: '#8FC7CE', detail: '#5FA0A8', goal: 11, speed: 1.95, chilis: 4, telegraph: 975 },
  { name: '해왕성', body: '#4E6ED1', detail: '#3A52A3', goal: 12, speed: 2.1, chilis: 4, telegraph: 950 },
];

const CHILI_LIFE_MS = 6000;
const PLAYER_ARC = 0.16;     // 충돌 판정 반각(rad)
const FOOD_ARC = 0.22;       // 먹이 판정 반각 — 넉넉하게
const COMBO_MS = 2600;       // 이 안에 연속으로 먹으면 콤보
const WARP_MS = 1700;        // 행성 이동 연출 시간

const FOODS = [
  { fill: '#F6DFC0', edge: '#C99B6C' },
  { fill: '#EBC66D', edge: '#B98935' },
  { fill: '#F1BEA0', edge: '#B9785F' },
];

const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
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
    let stars = [];

    const game = {
      state: 'ready',            // ready | run | warp | over | win
      round: 0,
      angle: -Math.PI / 2,
      dir: 1,
      score: 0,
      best: parseInt(localStorage.getItem(bestKey), 10) || 0,
      eaten: 0,                  // 현재 라운드에서 먹은 수
      combo: 0,
      lastEat: 0,
      foods: [],                 // { angle, kind }
      chilis: [],                // { angle, armAt, dieAt }
      pop: null,                 // { x, y, text, until }
      warpUntil: 0,
      paused: false,
    };

    const planet = () => PLANETS[game.round];

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
      stars = Array.from({ length: 90 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() < 0.85 ? 1 : 1.8,
        tw: Math.random() * TAU,
      }));
      const rotated = width > height && window.matchMedia('(pointer: coarse)').matches;
      game.paused = rotated;
    };

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
      if (game.chilis.length >= planet().chilis) return;
      const telegraph = planet().telegraph;
      // 예고가 끝나는 순간 피할 수 없는 위치는 비워서 이유 없는 죽음을 막는다
      const unreachable = planet().speed * (telegraph / 1000) + PLAYER_ARC + 0.35;
      const angle = freeAngle(Math.min(unreachable, Math.PI * 0.8));
      if (angle !== null) {
        game.chilis.push({ angle, armAt: now + telegraph, dieAt: now + telegraph + CHILI_LIFE_MS });
      }
    };

    const startRound = (now, keepScore) => {
      game.angle = -Math.PI / 2;
      game.dir = 1;
      game.eaten = 0;
      game.combo = 0;
      game.lastEat = 0;
      game.foods = [];
      game.chilis = [];
      game.pop = null;
      if (!keepScore) game.score = 0;
      spawnFood(); spawnFood(); spawnFood();
      spawnChili(now);
    };

    const finish = (win) => {
      game.state = win ? 'win' : 'over';
      if (game.score > game.best) {
        game.best = game.score;
        try { localStorage.setItem(bestKey, String(game.score)); } catch { /* ignore */ }
      }
    };

    const input = () => {
      if (game.paused) return;
      const now = performance.now();
      if (game.state === 'ready' || game.state === 'over' || game.state === 'win') {
        game.round = 0;
        game.state = 'run';
        startRound(now, false);
        return;
      }
      if (game.state === 'warp') return;
      game.dir *= -1;
    };

    const step = (dt, now) => {
      if (game.paused) return;
      if (game.state === 'warp') {
        if (now >= game.warpUntil) { game.state = 'run'; startRound(now, true); }
        return;
      }
      if (game.state !== 'run') return;
      game.angle = norm(game.angle + game.dir * planet().speed * dt);

      for (let i = game.foods.length - 1; i >= 0; i -= 1) {
        if (angleGap(game.angle, game.foods[i].angle) < FOOD_ARC) {
          const food = game.foods.splice(i, 1)[0];
          game.combo = now - game.lastEat < COMBO_MS ? Math.min(5, game.combo + 1) : 1;
          game.lastEat = now;
          const gained = 10 * (game.round + 1) * game.combo;
          game.score += gained;
          game.eaten += 1;
          const px = cx + Math.cos(food.angle) * radius;
          const py = cy + Math.sin(food.angle) * radius;
          game.pop = { x: px, y: py - 26, text: `+${gained}${game.combo > 1 ? ' ×' + game.combo : ''}`, until: now + 700 };

          if (game.eaten >= planet().goal) {
            if (game.round >= PLANETS.length - 1) { finish(true); return; }
            game.round += 1;
            game.state = 'warp';
            game.warpUntil = now + WARP_MS;
            return;
          }
          spawnFood();
          if (game.eaten % 3 === 0) spawnChili(now);
        }
      }

      game.chilis = game.chilis.filter((c) => now < c.dieAt);
      for (const chili of game.chilis) {
        if (now >= chili.armAt && angleGap(game.angle, chili.angle) < PLAYER_ARC) { finish(false); return; }
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
      ctx.fillStyle = '#E05A41';
      ctx.strokeStyle = '#9E3A26';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 2, 7, 12, 0.5, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#6F8B4E';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(4, -8); ctx.quadraticCurveTo(8, -14, 3, -16); ctx.stroke();
      ctx.restore();
    };

    // 중앙 행성 — 라운드마다 색과 디테일이 바뀐다
    const drawPlanet = (now) => {
      const p = planet();
      const pr = radius * 0.42;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.clip();
      ctx.fillStyle = p.body;
      ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);
      // 줄무늬(목성·토성류) / 반점 — detail 색으로 단순 표현
      ctx.fillStyle = p.detail;
      if (game.round === 2) { // 지구: 대륙 느낌 반점
        ctx.beginPath(); ctx.ellipse(cx - pr * 0.3, cy - pr * 0.25, pr * 0.42, pr * 0.3, 0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + pr * 0.45, cy + pr * 0.35, pr * 0.3, pr * 0.22, -0.4, 0, TAU); ctx.fill();
      } else if (game.round === 4 || game.round === 5) { // 목성·토성: 가로 줄무늬
        for (let i = -2; i <= 2; i += 1) {
          ctx.globalAlpha = 0.55;
          ctx.fillRect(cx - pr, cy + i * pr * 0.34 - pr * 0.08, pr * 2, pr * 0.16);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(cx - pr * 0.35, cy - pr * 0.2, pr * 0.28, pr * 0.2, 0.3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + pr * 0.3, cy + pr * 0.4, pr * 0.2, pr * 0.14, -0.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 명암
      const shade = ctx.createRadialGradient(cx - pr * 0.4, cy - pr * 0.4, pr * 0.2, cx, cy, pr * 1.4);
      shade.addColorStop(0, 'rgba(255,255,255,.18)');
      shade.addColorStop(1, 'rgba(4,6,18,.55)');
      ctx.fillStyle = shade;
      ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);
      ctx.restore();

      if (game.round === 5) { // 토성 고리
        ctx.save();
        ctx.strokeStyle = 'rgba(224,196,140,.75)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(cx, cy, pr * 1.55, pr * 0.42, -0.35, 0, TAU); ctx.stroke();
        ctx.restore();
      }

      if (mascot.complete && mascot.naturalWidth) {
        const bob = Math.sin(now * 0.003) * 3;
        ctx.drawImage(mascot, cx - 17, cy - pr - 42 + bob, 34, 34);
      }
    };

    const draw = (now) => {
      // 우주 배경
      ctx.fillStyle = '#0A0D1E';
      ctx.fillRect(0, 0, width, height);
      stars.forEach((star) => {
        ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(now * 0.0011 + star.tw));
        ctx.fillStyle = '#E9ECFF';
        ctx.fillRect(star.x, star.y, star.r, star.r);
      });
      ctx.globalAlpha = 1;

      // HUD
      ctx.fillStyle = '#F2EFE4';
      ctx.font = '700 24px "Space Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(game.score).padStart(5, '0'), cx, 52);
      ctx.fillStyle = 'rgba(233,236,255,.45)';
      ctx.font = '400 10px "Space Mono", monospace';
      ctx.fillText('BEST ' + String(game.best).padStart(5, '0'), cx, 69);
      ctx.font = '700 11px "Space Mono", monospace';
      ctx.fillStyle = planet().body;
      ctx.fillText(`ROUND ${game.round + 1}/8 · ${planet().name} · ${Math.min(game.eaten, planet().goal)}/${planet().goal}`, cx, 90);

      // 궤도
      ctx.strokeStyle = 'rgba(233,236,255,.16)';
      ctx.lineWidth = 26;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(233,236,255,.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, radius - 13, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, radius + 13, 0, TAU); ctx.stroke();

      drawPlanet(now);

      game.foods.forEach((food) => {
        const def = FOODS[food.kind];
        bun(cx + Math.cos(food.angle) * radius, cy + Math.sin(food.angle) * radius, 12, def.fill, def.edge);
      });
      game.chilis.forEach((chili) => {
        chiliShape(cx + Math.cos(chili.angle) * radius, cy + Math.sin(chili.angle) * radius, now < chili.armAt);
      });

      // 플레이어(우주 딤섬) + 진행 방향 화살표
      const px = cx + Math.cos(game.angle) * radius;
      const py = cy + Math.sin(game.angle) * radius;
      ctx.strokeStyle = 'rgba(233,236,255,.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 19, 0, TAU); ctx.stroke(); // 헬멧
      bun(px, py, 14, '#FFF1C9', '#D5A64F');
      const ahead = game.angle + game.dir * 0.34;
      const ax = cx + Math.cos(ahead) * radius;
      const ay = cy + Math.sin(ahead) * radius;
      ctx.strokeStyle = 'rgba(233,236,255,.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px + (ax - px) * 0.5, py + (ay - py) * 0.5); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.fillStyle = 'rgba(233,236,255,.6)';
      const tip = Math.atan2(ay - py, ax - px);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 7 * Math.cos(tip - 0.5), ay - 7 * Math.sin(tip - 0.5));
      ctx.lineTo(ax - 7 * Math.cos(tip + 0.5), ay - 7 * Math.sin(tip + 0.5));
      ctx.fill();

      if (game.pop && now < game.pop.until) {
        const t = 1 - (game.pop.until - now) / 700;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#F2EFE4';
        ctx.font = '700 14px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(game.pop.text, game.pop.x, game.pop.y - t * 18);
        ctx.globalAlpha = 1;
      }

      // 워프 연출
      if (game.state === 'warp') {
        const t = 1 - (game.warpUntil - now) / WARP_MS;
        ctx.fillStyle = `rgba(10,13,30,${0.5 + 0.4 * Math.sin(t * Math.PI)})`;
        ctx.fillRect(0, 0, width, height);
        ctx.textAlign = 'center';
        ctx.fillStyle = planet().body;
        ctx.font = '700 22px "Apple SD Gothic Neo", sans-serif';
        ctx.fillText(`${planet().name}(으)로 워프!`, cx, height * 0.44);
        ctx.fillStyle = 'rgba(233,236,255,.6)';
        ctx.font = '400 12px "Apple SD Gothic Neo", sans-serif';
        ctx.fillText(`ROUND ${game.round + 1} — 더 빨라져요`, cx, height * 0.44 + 24);
      }

      if (game.state === 'ready' || game.state === 'over' || game.state === 'win') {
        ctx.fillStyle = 'rgba(10,13,30,.82)';
        ctx.fillRect(0, 0, width, height);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#F2EFE4';
        ctx.font = '700 24px "Apple SD Gothic Neo", sans-serif';
        const title = game.state === 'ready' ? '딤섬 오빗'
          : game.state === 'win' ? '태양계 정복! 🪐' : '매운 고추를 밟았어요!';
        ctx.fillText(title, cx, height * 0.42);
        ctx.fillStyle = 'rgba(233,236,255,.65)';
        ctx.font = '400 13px "Apple SD Gothic Neo", sans-serif';
        const sub = game.state === 'ready'
          ? '누르면 방향 반전 — 수금지화목토천해를 정복하세요'
          : game.state === 'win'
            ? `해왕성까지 완주 · ${game.score}점`
            : `${PLANETS[game.round].name}에서 ${game.score}점 · 눌러서 다시 도전`;
        ctx.fillText(sub, cx, height * 0.42 + 27);
        ctx.fillStyle = '#F2EFE4';
        ctx.font = '700 11px "Space Mono", monospace';
        ctx.fillText(game.state === 'ready' ? 'TAP TO LAUNCH' : 'TAP TO RETRY', cx, height * 0.42 + 58);
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
    <div className="mg og">
      <canvas ref={canvasRef} className="mg-canvas" aria-label="딤섬 오빗 게임" />
      <button className="mg-exit" onClick={onExit} aria-label="게임 나가기" title="나가기"><IconClose size={18} /></button>
      <div className="mg-name og-name">DIMSUM ORBIT</div>
    </div>
  );
}
