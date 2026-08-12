import { useEffect, useRef } from 'react';
import { IconClose } from './icons';

// 딤섬 오빗 — 원버튼 궤도 레이싱, 우주 라운드제.
//
// 수금지화목토천해 8개 행성을 궤도 삼아 돈다. 행성마다 목표 개수를
// 채우면 태양계 지도를 줌아웃했다가 다음 행성으로 줌인하며 워프한다.
//
// 수성은 레인 1개(탭 = 방향 반전 연습). 금성부터는 레인이 2~4개로
// 늘어나고 트랙이 물결치듯 굽어 레이싱 트랙처럼 보인다.
// 탭 = 바깥 레인으로 점프(맨 바깥에서는 안쪽으로 순환). 버튼 하나로
// 레인을 갈아타며 딤섬을 줍고 고추 레인을 피한다.
//
// 실물 클리커는 60~110ms 지연이 있어 순간 반응 요구를 없앴다:
// - 먹이는 궤도에 계속 남는다. 늦게 집어도 손해가 없다.
// - 고추는 최소 0.95초 동안 깜빡인 뒤에야 위험해진다(지연의 9배).
// - 최고 속도에서도 110ms 이동각(~14°)이 고추 판정 폭(18°)보다 작다.

const PLANETS = [
  { name: '수성', body: '#B9AFA4', detail: '#8E8377', goal: 8, speed: 1.4, chilis: 0, telegraph: 1250, lanes: 1 },
  { name: '금성', body: '#E3B96F', detail: '#C29347', goal: 12, speed: 1.5, chilis: 1, telegraph: 1200, lanes: 2 },
  { name: '지구', body: '#5B8FB9', detail: '#7FA76B', goal: 14, speed: 1.6, chilis: 2, telegraph: 1150, lanes: 2 },
  { name: '화성', body: '#C96F4A', detail: '#9E4E31', goal: 16, speed: 1.7, chilis: 2, telegraph: 1100, lanes: 3 },
  { name: '목성', body: '#D9A876', detail: '#B07E4E', goal: 18, speed: 1.8, chilis: 3, telegraph: 1050, lanes: 3 },
  { name: '토성', body: '#E0C48C', detail: '#B79A5E', goal: 20, speed: 1.9, chilis: 3, telegraph: 1000, lanes: 3 },
  { name: '천왕성', body: '#8FC7CE', detail: '#5FA0A8', goal: 23, speed: 2.0, chilis: 4, telegraph: 975, lanes: 4 },
  { name: '해왕성', body: '#4E6ED1', detail: '#3A52A3', goal: 26, speed: 2.1, chilis: 5, telegraph: 950, lanes: 4 },
];

const CHILI_LIFE_MS = 6000;
const PLAYER_ARC = 0.16;     // 충돌 판정 반각(rad)
const FOOD_ARC = 0.22;       // 먹이 판정 반각 — 넉넉하게
const COMBO_MS = 2600;
const WARP_MS = 2600;        // 태양계 줌 연출 시간
const MAP_GAP = 320;         // 태양계 지도에서 행성 간 거리
const MAP_R = 40;            // 지도 위 행성 반지름

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
const smooth = (t) => t * t * (3 - 2 * t);

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
    let laneGap = 28;
    let raf = 0;
    let last = performance.now();
    let stars = [];

    const game = {
      state: 'ready',            // ready | run | warp | over | win
      round: 0,
      angle: -Math.PI / 2,
      dir: 1,
      lane: 0,
      laneVis: 0,                // 렌더용 레인(점프 애니메이션)
      score: 0,
      best: parseInt(localStorage.getItem(bestKey), 10) || 0,
      eaten: 0,
      combo: 0,
      lastEat: 0,
      foods: [],                 // { angle, lane, kind }
      chilis: [],                // { angle, lane, armAt, dieAt }
      pop: null,
      warpFrom: 0,
      warpUntil: 0,
      paused: false,
    };

    const planet = () => PLANETS[game.round];
    const laneCount = () => planet().lanes;

    // 레이싱 트랙 굴곡 — 각도에 따라 반지름이 물결친다
    const wobble = (angle) => radius * (0.055 * Math.sin(3 * angle + 0.7) + 0.03 * Math.sin(5 * angle - 1.1));
    const laneRadius = (lane, angle) => {
      const base = radius - ((laneCount() - 1) * laneGap) / 2;
      return base + lane * laneGap + wobble(angle);
    };
    const posOf = (angle, lane) => {
      const r = laneRadius(lane, angle);
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
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
      radius = Math.min(width, height) * 0.33;
      laneGap = Math.max(24, Math.min(30, radius * 0.19));
      stars = Array.from({ length: 90 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() < 0.85 ? 1 : 1.8,
        tw: Math.random() * TAU,
      }));
      const rotated = width > height && window.matchMedia('(pointer: coarse)').matches;
      game.paused = rotated;
    };

    const freeSpot = (clearFromPlayer) => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const angle = Math.random() * TAU;
        const lane = (Math.random() * laneCount()) | 0;
        if (lane === game.lane && angleGap(angle, game.angle) < clearFromPlayer) continue;
        if (game.foods.some((f) => f.lane === lane && angleGap(angle, f.angle) < 0.5)) continue;
        // 고추끼리는 레인이 달라도 각도를 띄워 '전 레인 봉쇄'를 막는다
        if (game.chilis.some((c) => angleGap(angle, c.angle) < (c.lane === lane ? 0.7 : 0.5))) continue;
        return { angle, lane };
      }
      return null;
    };

    const spawnFood = () => {
      const spot = freeSpot(0.5);
      if (spot) game.foods.push({ ...spot, kind: (Math.random() * FOODS.length) | 0 });
    };

    const spawnChili = (now) => {
      if (game.chilis.length >= planet().chilis) return;
      const telegraph = planet().telegraph;
      const unreachable = planet().speed * (telegraph / 1000) + PLAYER_ARC + 0.35;
      const spot = freeSpot(Math.min(unreachable, Math.PI * 0.8));
      if (spot) game.chilis.push({ ...spot, armAt: now + telegraph, dieAt: now + telegraph + CHILI_LIFE_MS });
    };

    const startRound = (now, keepScore) => {
      game.angle = -Math.PI / 2;
      game.dir = 1;
      game.lane = 0;
      game.laneVis = 0;
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
      // 레인이 1개면 방향 반전(수성 연습), 여러 개면 레인 점프
      if (laneCount() === 1) game.dir *= -1;
      else game.lane = (game.lane + 1) % laneCount();
    };

    const step = (dt, now) => {
      if (game.paused) return;
      if (game.state === 'warp') {
        if (now >= game.warpUntil) { game.state = 'run'; startRound(now, true); }
        return;
      }
      if (game.state !== 'run') return;
      game.angle = norm(game.angle + game.dir * planet().speed * dt);
      // 레인 점프 애니메이션(~120ms)
      game.laneVis += (game.lane - game.laneVis) * Math.min(1, dt * 14);

      for (let i = game.foods.length - 1; i >= 0; i -= 1) {
        const food = game.foods[i];
        if (food.lane === game.lane && angleGap(game.angle, food.angle) < FOOD_ARC) {
          game.foods.splice(i, 1);
          game.combo = now - game.lastEat < COMBO_MS ? Math.min(5, game.combo + 1) : 1;
          game.lastEat = now;
          const gained = 10 * (game.round + 1) * game.combo;
          game.score += gained;
          game.eaten += 1;
          const p = posOf(food.angle, food.lane);
          game.pop = { x: p.x, y: p.y - 26, text: `+${gained}${game.combo > 1 ? ' ×' + game.combo : ''}`, until: now + 700 };

          if (game.eaten >= planet().goal) {
            if (game.round >= PLANETS.length - 1) { finish(true); return; }
            game.warpFrom = game.round;
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
        if (chili.lane === game.lane && now >= chili.armAt && angleGap(game.angle, chili.angle) < PLAYER_ARC) {
          finish(false);
          return;
        }
      }

      if (game.foods.length < Math.min(3, 1 + laneCount())) spawnFood();
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

    // 행성 — 게임 중앙과 태양계 지도 양쪽에서 쓴다
    const paintPlanet = (x, y, pr, idx) => {
      const p = PLANETS[idx];
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.clip();
      ctx.fillStyle = p.body;
      ctx.fillRect(x - pr, y - pr, pr * 2, pr * 2);
      ctx.fillStyle = p.detail;
      if (idx === 2) {
        ctx.beginPath(); ctx.ellipse(x - pr * 0.3, y - pr * 0.25, pr * 0.42, pr * 0.3, 0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + pr * 0.45, y + pr * 0.35, pr * 0.3, pr * 0.22, -0.4, 0, TAU); ctx.fill();
      } else if (idx === 4 || idx === 5) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.globalAlpha = 0.55;
          ctx.fillRect(x - pr, y + i * pr * 0.34 - pr * 0.08, pr * 2, pr * 0.16);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(x - pr * 0.35, y - pr * 0.2, pr * 0.28, pr * 0.2, 0.3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + pr * 0.3, y + pr * 0.4, pr * 0.2, pr * 0.14, -0.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      const shade = ctx.createRadialGradient(x - pr * 0.4, y - pr * 0.4, pr * 0.2, x, y, pr * 1.4);
      shade.addColorStop(0, 'rgba(255,255,255,.18)');
      shade.addColorStop(1, 'rgba(4,6,18,.55)');
      ctx.fillStyle = shade;
      ctx.fillRect(x - pr, y - pr, pr * 2, pr * 2);
      ctx.restore();
      if (idx === 5) {
        ctx.strokeStyle = 'rgba(224,196,140,.75)';
        ctx.lineWidth = Math.max(2, pr * 0.11);
        ctx.beginPath(); ctx.ellipse(x, y, pr * 1.55, pr * 0.42, -0.35, 0, TAU); ctx.stroke();
      }
    };

    const drawStars = (now) => {
      ctx.fillStyle = '#0A0D1E';
      ctx.fillRect(0, 0, width, height);
      stars.forEach((star) => {
        ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(now * 0.0011 + star.tw));
        ctx.fillStyle = '#E9ECFF';
        ctx.fillRect(star.x, star.y, star.r, star.r);
      });
      ctx.globalAlpha = 1;
    };

    // 태양계 줌 워프 — 현재 행성에서 줌아웃 → 카메라 이동 → 다음 행성 줌인
    const drawWarp = (now) => {
      const t = Math.min(1, Math.max(0, 1 - (game.warpUntil - now) / WARP_MS));
      const pr = radius * 0.4;                 // 게임 화면에서의 행성 크기
      const endScale = pr / MAP_R;             // 지도 행성이 게임 크기로 보이는 배율
      const scale = endScale - (endScale - 0.42) * Math.sin(Math.PI * t);
      const camX = (game.warpFrom + smooth(t) * (game.round - game.warpFrom)) * MAP_GAP;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-camX, 0);

      // 태양 + 궤도 안내선
      const sunX = -MAP_GAP * 1.6;
      const glow = ctx.createRadialGradient(sunX, 0, 10, sunX, 0, 220);
      glow.addColorStop(0, 'rgba(255,214,120,.9)');
      glow.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sunX, 0, 220, 0, TAU); ctx.fill();
      ctx.fillStyle = '#FFD678';
      ctx.beginPath(); ctx.arc(sunX, 0, 64, 0, TAU); ctx.fill();

      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = 'rgba(233,236,255,.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sunX + 70, 0); ctx.lineTo(PLANETS.length * MAP_GAP, 0); ctx.stroke();
      ctx.setLineDash([]);

      PLANETS.forEach((p, k) => {
        paintPlanet(k * MAP_GAP, 0, MAP_R, k);
        ctx.fillStyle = k === game.round ? '#F2EFE4' : 'rgba(233,236,255,.45)';
        ctx.font = '700 16px "Apple SD Gothic Neo", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, k * MAP_GAP, MAP_R + 34);
      });
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.fillStyle = planet().body;
      ctx.font = '700 18px "Apple SD Gothic Neo", sans-serif';
      ctx.fillText(`${planet().name}(으)로 워프 중…`, cx, height - 72);
      ctx.fillStyle = 'rgba(233,236,255,.55)';
      ctx.font = '400 12px "Apple SD Gothic Neo", sans-serif';
      ctx.fillText(`ROUND ${game.round + 1} · 레인 ${planet().lanes}개 · 목표 ${planet().goal}개`, cx, height - 50);
    };

    const draw = (now) => {
      drawStars(now);

      if (game.state === 'warp') { drawWarp(now); return; }

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

      // 레이싱 트랙(굽은 레인들) — 내 레인은 밝게
      for (let lane = 0; lane < laneCount(); lane += 1) {
        ctx.strokeStyle = Math.round(game.laneVis) === lane ? 'rgba(233,236,255,.34)' : 'rgba(233,236,255,.13)';
        ctx.lineWidth = laneGap * 0.72;
        ctx.beginPath();
        for (let a = 0; a <= TAU + 0.1; a += 0.07) {
          const r = laneRadius(lane, a);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // 트랙 경계선
      ctx.strokeStyle = 'rgba(233,236,255,.22)';
      ctx.lineWidth = 1;
      [-0.5, laneCount() - 0.5].forEach((edge) => {
        ctx.beginPath();
        for (let a = 0; a <= TAU + 0.1; a += 0.07) {
          const base = radius - ((laneCount() - 1) * laneGap) / 2;
          const r = base + edge * laneGap + wobble(a);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      paintPlanet(cx, cy, radius * 0.4, game.round);
      if (mascot.complete && mascot.naturalWidth) {
        const bob = Math.sin(now * 0.003) * 3;
        ctx.drawImage(mascot, cx - 17, cy - radius * 0.4 - 42 + bob, 34, 34);
      }

      game.foods.forEach((food) => {
        const p = posOf(food.angle, food.lane);
        const def = FOODS[food.kind];
        bun(p.x, p.y, 11, def.fill, def.edge);
      });
      game.chilis.forEach((chili) => {
        const p = posOf(chili.angle, chili.lane);
        chiliShape(p.x, p.y, now < chili.armAt);
      });

      // 플레이어 + 진행 방향 화살표
      const pp = posOf(game.angle, game.laneVis);
      ctx.strokeStyle = 'rgba(233,236,255,.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(pp.x, pp.y, 18, 0, TAU); ctx.stroke();
      bun(pp.x, pp.y, 13, '#FFF1C9', '#D5A64F');
      const ahead = game.angle + game.dir * 0.32;
      const ap = posOf(ahead, game.laneVis);
      ctx.strokeStyle = 'rgba(233,236,255,.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pp.x + (ap.x - pp.x) * 0.5, pp.y + (ap.y - pp.y) * 0.5); ctx.lineTo(ap.x, ap.y); ctx.stroke();
      ctx.fillStyle = 'rgba(233,236,255,.6)';
      const tip = Math.atan2(ap.y - pp.y, ap.x - pp.x);
      ctx.beginPath();
      ctx.moveTo(ap.x, ap.y);
      ctx.lineTo(ap.x - 7 * Math.cos(tip - 0.5), ap.y - 7 * Math.sin(tip - 0.5));
      ctx.lineTo(ap.x - 7 * Math.cos(tip + 0.5), ap.y - 7 * Math.sin(tip + 0.5));
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
          ? '탭 = 레인 점프 — 수금지화목토천해를 정복하세요'
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
