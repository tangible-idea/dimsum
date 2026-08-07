import { useEffect, useRef } from 'react';
import { MSG_W, MSG_H, decodeBitmap } from '../lib/bitmap';

const PX = 8;

// 공통 렌더: 1bpp 비트맵을 캔버스에 확대해 그린다.
const paint = (cv, msg, scale) => {
  if (!cv || !msg) return;
  const w = msg.w || MSG_W;
  const h = msg.h || MSG_H;
  const px = decodeBitmap({ enc: msg.enc, d: msg.d, w, h });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#12140f';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#cfe8ff';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[y * w + x]) ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
};

// 목록용 작은 미리보기
export function PixelThumb({ msg, scale = 2 }) {
  const ref = useRef(null);
  useEffect(() => { paint(ref.current, msg, scale); }, [msg, scale]);
  if (!msg) return null;
  return (
    <canvas
      ref={ref}
      className="pv-thumb"
      width={(msg.w || MSG_W) * scale}
      height={(msg.h || MSG_H) * scale}
    />
  );
}

// 친구가 보낸 픽셀 그림을 기기와 똑같이 보여준다(읽기 전용).
// msg = { n, w, h, enc, d }
export default function PixelView({ msg, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => { paint(canvasRef.current, msg, PX); }, [msg]);

  if (!msg) return null;

  return (
    <div className="pd" onClick={onClose}>
      <div className="pd-card" onClick={(e) => e.stopPropagation()}>
        <div className="pd-head">
          <span className="t">{msg.n || '친구'}님이 보냈어요</span>
        </div>
        <canvas
          ref={canvasRef}
          className="pd-canvas"
          width={(msg.w || MSG_W) * PX}
          height={(msg.h || MSG_H) * PX}
        />
        <div className="pd-actions">
          <button className="gbtn" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}
