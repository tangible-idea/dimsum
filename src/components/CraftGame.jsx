import { useEffect, useRef } from 'react';
import { IconClose } from './icons';

const PIECES = [
  { name: '새우볼', r: 18, fill: '#F3C6A8', edge: '#C98469', score: 10 },
  { name: '하가우', r: 24, fill: '#F6DFC0', edge: '#C99B6C', score: 25 },
  { name: '교자', r: 31, fill: '#D9D8A7', edge: '#969866', score: 55 },
  { name: '샤오마이', r: 39, fill: '#EBC66D', edge: '#B98935', score: 120 },
  { name: '차슈바오', r: 48, fill: '#F4E5C4', edge: '#C5A77A', score: 260 },
  { name: '왕만두', r: 60, fill: '#FFF1C9', edge: '#D5A64F', score: 600 },
];

const nextPiece = () => {
  const n = Math.random();
  return n < 0.48 ? 0 : n < 0.82 ? 1 : 2;
};

export default function MergeGame({ myId, character, onExit }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bestKey = 'tc:merge:' + myId;
    const mascot = new Image();
    mascot.src = character.img;
    let width = 0;
    let height = 0;
    let left = 0;
    let right = 0;
    let top = 104;
    let floor = 0;
    let raf = 0;
    let last = performance.now();
    let id = 0;

    const game = {
      state: 'ready',
      balls: [],
      score: 0,
      best: parseInt(localStorage.getItem(bestKey), 10) || 0,
      next: nextPiece(),
      dropX: 0,
      nextDrop: 0,
      dangerSince: 0,
      flash: 0,
      combo: 0,
      drops: 0,
      speed: 1,
      sweepPhase: 0,
    };

    const resize = () => {
      const oldWidth = width || canvas.clientWidth;
      const oldHeight = height || canvas.clientHeight;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      left = Math.max(14, (width - 430) / 2);
      right = Math.min(width - 14, (width + 430) / 2);
      if (!game.dropX) game.dropX = (left + right) / 2;
      top = Math.max(96, height * 0.15);
      floor = height - 42;
      if (oldWidth && oldHeight && game.balls.length) {
        const sx = width / oldWidth;
        const sy = height / oldHeight;
        game.balls.forEach((ball) => { ball.x *= sx; ball.y *= sy; });
      }
    };

    const seedBoard = () => {
      const span = right - left;
      const now = performance.now() - 3000;
      const seeds = [
        { type: 1, x: 0.16, lift: 0 },
        { type: 2, x: 0.39, lift: 0 },
        { type: 1, x: 0.62, lift: 0 },
        { type: 2, x: 0.84, lift: 0 },
        { type: 0, x: 0.28, lift: 82 },
        { type: 0, x: 0.51, lift: 92 },
        { type: 0, x: 0.73, lift: 78 },
      ];
      game.balls = seeds.map((seed) => ({
        id: id += 1,
        type: seed.type,
        x: left + span * seed.x,
        y: floor - PIECES[seed.type].r - seed.lift,
        vx: 0,
        vy: 0,
        born: now,
      }));
    };

    const reset = () => {
      seedBoard();
      game.score = 0;
      game.next = nextPiece();
      game.nextDrop = 0;
      game.dangerSince = 0;
      game.flash = 0;
      game.combo = 0;
      game.drops = 0;
      game.speed = 1;
      game.sweepPhase = 0;
    };

    const drop = (now) => {
      if (now < game.nextDrop) return;
      const type = game.next;
      game.balls.push({ id: id += 1, type, x: game.dropX, y: top + 24, vx: 0, vy: 35, born: now });
      game.next = nextPiece();
      game.nextDrop = now + 620;
      game.combo = 0;
      game.drops += 1;
      game.speed = Math.min(2.5, 1 + game.drops * 0.075);
    };

    const input = () => {
      const now = performance.now();
      if (game.state === 'ready') { game.state = 'run'; drop(now); return; }
      if (game.state === 'over') { reset(); game.state = 'run'; drop(now); return; }
      drop(now);
    };

    const finish = () => {
      game.state = 'over';
      if (game.score > game.best) {
        game.best = game.score;
        try { localStorage.setItem(bestKey, String(game.score)); } catch { /* ignore */ }
      }
    };

    const mergeOnce = (now) => {
      for (let i = 0; i < game.balls.length; i += 1) {
        const a = game.balls[i];
        for (let j = i + 1; j < game.balls.length; j += 1) {
          const b = game.balls[j];
          if (a.type !== b.type || a.type >= PIECES.length - 1) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const limit = PIECES[a.type].r * 2 + 1.5;
          if (dx * dx + dy * dy >= limit * limit) continue;
          const type = a.type + 1;
          game.balls.splice(j, 1);
          game.balls.splice(i, 1);
          game.balls.push({
            id: id += 1,
            type,
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            vx: (a.vx + b.vx) * 0.35,
            vy: Math.min(-90, (a.vy + b.vy) * 0.25),
            born: now,
          });
          game.combo += 1;
          game.score += PIECES[type].score * Math.min(3, game.combo);
          game.flash = now + 260;
          return true;
        }
      }
      return false;
    };

    const physics = (dt, now) => {
      if (game.state === 'over') return;
      const steps = 3;
      const step = dt / steps;
      for (let pass = 0; pass < steps; pass += 1) {
        game.balls.forEach((ball) => {
          const radius = PIECES[ball.type].r;
          ball.vy += 1080 * step;
          ball.x += ball.vx * step;
          ball.y += ball.vy * step;
          if (ball.x - radius < left) { ball.x = left + radius; ball.vx = Math.abs(ball.vx) * 0.22; }
          if (ball.x + radius > right) { ball.x = right - radius; ball.vx = -Math.abs(ball.vx) * 0.22; }
          if (ball.y + radius > floor) {
            ball.y = floor - radius;
            ball.vy = Math.abs(ball.vy) > 45 ? -Math.abs(ball.vy) * 0.12 : 0;
            ball.vx *= 0.94;
          }
        });

        for (let i = 0; i < game.balls.length; i += 1) {
          for (let j = i + 1; j < game.balls.length; j += 1) {
            const a = game.balls[i];
            const b = game.balls[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distance = Math.max(0.01, Math.hypot(dx, dy));
            const target = PIECES[a.type].r + PIECES[b.type].r;
            if (distance >= target) continue;
            const nx = dx / distance;
            const ny = dy / distance;
            const overlap = target - distance;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (relative < 0) {
              const impulse = -relative * 0.58;
              a.vx -= impulse * nx;
              a.vy -= impulse * ny;
              b.vx += impulse * nx;
              b.vy += impulse * ny;
            }
          }
        }
      }

      if (game.state === 'ready') return;
      let merged = true;
      let guard = 0;
      while (merged && guard < 5) { merged = mergeOnce(now); guard += 1; }

      const dangerLine = top + 42;
      const dangerous = game.balls.some((ball) => now - ball.born > 1300 && ball.y - PIECES[ball.type].r < dangerLine && Math.hypot(ball.vx, ball.vy) < 80);
      if (dangerous) {
        if (!game.dangerSince) game.dangerSince = now;
        if (now - game.dangerSince > 2200) finish();
      } else {
        game.dangerSince = 0;
      }
    };

    const dumpling = (x, y, type, alpha = 1) => {
      const piece = PIECES[type];
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(78,51,25,.13)';
      ctx.beginPath(); ctx.ellipse(3, piece.r * 0.76, piece.r * 0.75, piece.r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = piece.fill;
      ctx.strokeStyle = piece.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-piece.r * 0.86, piece.r * 0.35);
      ctx.bezierCurveTo(-piece.r, -piece.r * 0.5, -piece.r * 0.42, -piece.r, 0, -piece.r * 0.86);
      ctx.bezierCurveTo(piece.r * 0.42, -piece.r, piece.r, -piece.r * 0.5, piece.r * 0.86, piece.r * 0.35);
      ctx.bezierCurveTo(piece.r * 0.62, piece.r * 0.88, -piece.r * 0.62, piece.r * 0.88, -piece.r * 0.86, piece.r * 0.35);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = piece.edge;
      ctx.lineWidth = Math.max(1, piece.r * 0.045);
      for (let fold = -2; fold <= 2; fold += 1) {
        ctx.beginPath();
        ctx.moveTo(fold * piece.r * 0.16, -piece.r * 0.79);
        ctx.lineTo(fold * piece.r * 0.1, -piece.r * 0.38);
        ctx.stroke();
      }
      ctx.restore();
    };

    const draw = (now) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#F6F5F0'; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#201E17';
      ctx.font = '700 24px "Space Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(String(game.score).padStart(5, '0'), left, 48);
      ctx.fillStyle = '#B4B0A4';
      ctx.font = '400 10px "Space Mono", monospace';
      ctx.fillText('BEST ' + String(game.best).padStart(5, '0'), left, 65);
      ctx.textAlign = 'right';
      ctx.fillText('NEXT · ' + PIECES[game.next].name, right, 48);
      dumpling(right - 16, 73, game.next, 0.75);
      if (mascot.complete && mascot.naturalWidth) ctx.drawImage(mascot, left + 8, top - 22, 38, 38);

      const dangerLine = top + 42;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = game.dangerSince ? '#C0503C' : '#DDD9CD';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, dangerLine); ctx.lineTo(right, dangerLine); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = game.dangerSince ? '#C0503C' : '#B4B0A4';
      ctx.textAlign = 'left';
      ctx.font = '500 9px "Apple SD Gothic Neo", sans-serif';
      ctx.fillText(game.dangerSince ? '넘치기 직전!' : '여기까지 쌓이면 끝', left + 48, dangerLine - 7);

      ctx.fillStyle = '#D5AE69';
      ctx.fillRect(left, floor, right - left, height - floor);
      ctx.fillStyle = 'rgba(105,67,27,.16)';
      for (let x = left + 8; x < right; x += 18) ctx.fillRect(x, floor, 2, height - floor);
      ctx.strokeStyle = '#A97C3E';
      ctx.lineWidth = 2;
      ctx.strokeRect(left, floor, right - left, height - floor + 2);

      game.balls.forEach((ball) => dumpling(ball.x, ball.y, ball.type));

      if (game.state !== 'over' && now >= game.nextDrop) {
        const previewY = top + 17;
        ctx.strokeStyle = '#C9C5B8';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(game.dropX, top - 20); ctx.lineTo(game.dropX, previewY - PIECES[game.next].r); ctx.stroke();
        dumpling(game.dropX, previewY, game.next, game.state === 'ready' ? 0.72 : 0.92);
      }

      if (game.dangerSince) {
        const leftTime = Math.max(0, 1 - (now - game.dangerSince) / 2200);
        ctx.fillStyle = '#E7DDD3'; ctx.fillRect(left, dangerLine + 5, right - left, 4);
        ctx.fillStyle = '#C0503C'; ctx.fillRect(left, dangerLine + 5, (right - left) * leftTime, 4);
      }

      if (now < game.flash) {
        ctx.fillStyle = `rgba(232,180,79,${(game.flash - now) / 520})`;
        ctx.fillRect(left, top, right - left, floor - top);
      }

      if (game.state === 'ready' || game.state === 'over') {
        ctx.fillStyle = 'rgba(246,245,240,.9)';
        ctx.fillRect(left, top, right - left, floor - top);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#201E17';
        ctx.font = '700 24px "Apple SD Gothic Neo", sans-serif';
        ctx.fillText(game.state === 'ready' ? '딤섬 합치기' : '찜기가 가득 찼어요', width / 2, height * 0.43);
        ctx.fillStyle = '#6A665A';
        ctx.font = '400 13px "Apple SD Gothic Neo", sans-serif';
        ctx.fillText(game.state === 'ready' ? '같은 딤섬을 만나게 떨어뜨리세요' : `${game.score}점 · 눌러서 다시 시작`, width / 2, height * 0.43 + 27);
        ctx.fillStyle = '#201E17';
        ctx.font = '700 11px "Space Mono", monospace';
        ctx.fillText(game.state === 'ready' ? 'TAP TO DROP' : 'TAP TO RETRY', width / 2, height * 0.43 + 58);
      }
    };

    const frame = (now) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const travel = Math.max(24, (right - left) / 2 - 68);
      game.sweepPhase += dt * 2.15 * game.speed;
      game.dropX = (left + right) / 2 + Math.sin(game.sweepPhase) * travel;
      physics(dt, now);
      draw(now);
      raf = requestAnimationFrame(frame);
    };

    const onPointer = (event) => { event.preventDefault(); input(); };
    const onKey = (event) => {
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); input(); }
    };
    resize();
    seedBoard();
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
      <canvas ref={canvasRef} className="mg-canvas" aria-label="딤섬 합치기 게임" />
      <button className="mg-exit" onClick={onExit} aria-label="게임 나가기" title="나가기"><IconClose size={18} /></button>
      <div className="mg-name">DIMSUM MERGE</div>
    </div>
  );
}
