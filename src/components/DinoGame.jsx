import { useEffect, useRef } from 'react';

// 딤섬 러너 — Chrome dino 스타일 러너 게임.
// 화면 탭 / 스페이스 / 실물 클리커 버튼(MQTT 신호 → 'dimsum:device-tap' 이벤트)으로 점프.

// 전용 장애물 스프라이트 — 실루엣이 서로 달라야 난이도가 읽힌다
// (높고 좁음 / 낮고 넓음 / 중간). h는 인게임 높이(주인공 54px 기준).
const OBSTACLE_DEFS = [
  { src: '/assets/obstacles/steamer_stack.png', h: 62 }, // 높고 좁음
  { src: '/assets/obstacles/chili_dish.png', h: 28 },    // 낮고 넓음
  { src: '/assets/obstacles/clay_teapot.png', h: 44 },   // 중간
];

const GRAVITY = 2600;      // px/s²
const JUMP_V = 930;        // 점프 초기 속도(px/s, 위 방향)
const BASE_SPEED = 280;    // 시작 스크롤 속도(px/s)
const MAX_SPEED = 600;
const RESTART_LOCK = 0.45; // 게임오버 직후 오터치 방지(초)

export default function DinoGame({ myId, character, onExit }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false; // 픽셀 캐릭터를 또렷하게

    const charImg = new Image();
    charImg.src = character.img;
    const obstacles = OBSTACLE_DEFS.map((o) => {
      const img = new Image();
      img.src = o.src;
      return { ...o, img };
    });

    const gy = Math.round(H * 0.72);   // 지면 y
    const charH = 54;
    const charW = Math.max(28, Math.round(charH * (character.w / Math.max(1, character.h))));
    const charX = Math.round(W * 0.16);
    const bestKey = 'tc:dino:' + myId;

    const g = {
      state: 'ready',                  // 'ready' | 'run' | 'over'
      y: 0, vy: 0, t: 0,               // y: 지면 위 높이(px)
      speed: BASE_SPEED,
      score: 0,
      best: parseInt(localStorage.getItem(bestKey), 10) || 0,
      obs: [], nextSpawn: 1.1,
      overAt: 0,
      specks: Array.from({ length: 26 }, () => ({
        x: Math.random() * W,
        y: gy + 6 + Math.random() * 18,
      })),
    };

    const reset = () => {
      g.y = 0; g.vy = 0; g.t = 0;
      g.speed = BASE_SPEED; g.score = 0;
      g.obs = []; g.nextSpawn = 1.1;
    };

    const input = (now) => {
      if (g.state === 'ready') { reset(); g.state = 'run'; return; }
      if (g.state === 'over') {
        if (now - g.overAt > RESTART_LOCK * 1000) { reset(); g.state = 'run'; }
        return;
      }
      if (g.y <= 0) g.vy = JUMP_V;
    };

    const step = (dt, now) => {
      if (g.state !== 'run') return;
      g.t += dt;
      g.speed = Math.min(MAX_SPEED, BASE_SPEED + g.t * 9);
      g.score += g.speed * dt * 0.055;

      // 점프 물리
      if (g.y > 0 || g.vy > 0) {
        g.y += g.vy * dt;
        g.vy -= GRAVITY * dt;
        if (g.y <= 0) { g.y = 0; g.vy = 0; }
      }

      // 지면 무늬 스크롤
      g.specks.forEach((s) => {
        s.x -= g.speed * dt;
        if (s.x < -4) { s.x += W + 8; s.y = gy + 6 + Math.random() * 18; }
      });

      // 장애물 스폰/이동
      g.nextSpawn -= dt;
      if (g.nextSpawn <= 0) {
        const def = obstacles[(Math.random() * obstacles.length) | 0];
        const ratio = def.img.naturalWidth ? def.img.naturalWidth / def.img.naturalHeight : 1;
        g.obs.push({ x: W + 60, w: Math.round(def.h * ratio), h: def.h, img: def.img });
        g.nextSpawn = (240 + Math.random() * 340 + g.speed * 0.4) / g.speed;
      }
      g.obs.forEach((o) => { o.x -= g.speed * dt; });
      g.obs = g.obs.filter((o) => o.x > -100);

      // 충돌(살짝 안쪽으로 관대하게)
      const cx0 = charX + 5;
      const cy0 = gy - charH - g.y + 6;
      const cx1 = charX + charW - 5;
      const cy1 = gy - g.y;
      for (const o of g.obs) {
        if (cx1 > o.x + 5 && cx0 < o.x + o.w - 5 && cy1 > gy - o.h + 5 && cy0 < gy) {
          g.state = 'over';
          g.overAt = now;
          const sc = Math.floor(g.score);
          if (sc > g.best) {
            g.best = sc;
            try { localStorage.setItem(bestKey, String(sc)); } catch { /* ignore */ }
          }
          break;
        }
      }
    };

    const drawImageSafe = (img, x, y, w, h, fallback) => {
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h);
      else { ctx.fillStyle = fallback; ctx.fillRect(x, y, w, h); }
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // 지면
      ctx.strokeStyle = '#DBD7CB';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, gy + 1); ctx.lineTo(W, gy + 1); ctx.stroke();
      ctx.fillStyle = '#E4E1D8';
      g.specks.forEach((s) => ctx.fillRect(s.x, s.y, 3, 2));

      // 장애물
      g.obs.forEach((o) => drawImageSafe(o.img, o.x, gy - o.h, o.w, o.h, '#C9C5B8'));

      // 캐릭터(달릴 때 잔걸음 바운스)
      const bob = g.state === 'run' && g.y <= 0 ? Math.abs(Math.sin(g.t * 14)) * -3 : 0;
      drawImageSafe(charImg, charX, gy - charH - g.y + bob, charW, charH, '#E8B44F');

      // 점수 HUD
      ctx.font = '700 15px "Space Mono", ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#201E17';
      ctx.fillText(String(Math.floor(g.score)).padStart(5, '0'), W - 16, 44);
      ctx.font = '400 10px "Space Mono", ui-monospace, monospace';
      ctx.fillStyle = '#B4B0A4';
      ctx.fillText('BEST ' + String(g.best).padStart(5, '0'), W - 16, 60);

      // 상태 메시지
      ctx.textAlign = 'center';
      if (g.state === 'ready') {
        ctx.fillStyle = '#201E17';
        ctx.font = '700 21px "Space Mono", ui-monospace, monospace';
        ctx.fillText('DIMSUM RUNNER', W / 2, H * 0.32);
        ctx.fillStyle = '#6A665A';
        ctx.font = '400 13px "Apple SD Gothic Neo", sans-serif';
        ctx.fillText('탭하면 시작! 실물 클리커 버튼으로도 점프해요', W / 2, H * 0.32 + 26);
      } else if (g.state === 'over') {
        ctx.fillStyle = '#201E17';
        ctx.font = '700 21px "Space Mono", ui-monospace, monospace';
        ctx.fillText('GAME OVER', W / 2, H * 0.32);
        ctx.fillStyle = '#6A665A';
        ctx.font = '400 13px "Apple SD Gothic Neo", sans-serif';
        ctx.fillText(`${Math.floor(g.score)}점 · 탭해서 다시 도전`, W / 2, H * 0.32 + 26);
      }
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt, now);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onPointer = (e) => { e.preventDefault(); input(performance.now()); };
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); input(performance.now()); }
    };
    const onDevice = () => input(performance.now());
    canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('dimsum:device-tap', onDevice);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dimsum:device-tap', onDevice);
    };
  }, [myId, character]);

  return (
    <div className="dg">
      <canvas ref={canvasRef} className="dg-canvas" />
      <button className="dg-exit" onClick={onExit} aria-label="게임 나가기">✕</button>
      <div className="dg-char-name">{character.name}</div>
    </div>
  );
}
