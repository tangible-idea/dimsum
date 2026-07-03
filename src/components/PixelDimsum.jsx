import { useMemo } from 'react';
import { PALETTE, STAGES, accById, accPlacement } from '../lib/pixels';

// 문자 그리드 → SVG rect 목록
const mapRects = (map, ox = 0, oy = 0) => {
  const rects = [];
  map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== '.' && PALETTE[ch]) rects.push({ x: x + ox, y: y + oy, c: PALETTE[ch] });
    });
  });
  return rects;
};

// 단독 스프라이트(보상 카드/도감 미리보기용)
export function Sprite({ map, px = 10, style }) {
  const w = map[0].length;
  const h = map.length;
  const rects = useMemo(() => mapRects(map), [map]);
  return (
    <svg
      width={w * px} height={h * px} viewBox={`0 0 ${w} ${h}`}
      style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges', ...style }}
      aria-hidden
    >
      {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width="1" height="1" fill={r.c} />)}
    </svg>
  );
}

// 성장 단계 + 착용 악세서리 합성 캐릭터
//   mood: 'ok' | 'hungry' | 'starving' — 배고프면 볼터치가 사라지고 입꼬리가 처짐
export default function PixelDimsum({ stageIdx, equipped = {}, px, mood = 'ok' }) {
  const stage = STAGES[stageIdx] || STAGES[0];
  const scale = px || stage.px;

  const { rects, minX, minY, w, h } = useMemo(() => {
    const layers = [{ map: stage.map, x: 0, y: 0 }];
    ['head', 'face', 'neck'].forEach((slot) => {
      const acc = accById(equipped[slot]);
      if (!acc || acc.slot !== slot) return;
      layers.push(accPlacement(stage, acc));
    });
    let x0 = 0; let y0 = 0; let x1 = stage.map[0].length; let y1 = stage.map.length;
    layers.forEach((l) => {
      x0 = Math.min(x0, l.x); y0 = Math.min(y0, l.y);
      x1 = Math.max(x1, l.x + l.map[0].length); y1 = Math.max(y1, l.y + l.map.length);
    });
    return {
      rects: layers.flatMap((l) => mapRects(l.map, l.x, l.y)),
      minX: x0, minY: y0, w: x1 - x0, h: y1 - y0,
    };
  }, [stage, equipped]);

  // 표정 패치: 색상 기준으로 입/볼/눈 픽셀을 찾아 변형
  const drawn = useMemo(() => {
    if (mood === 'ok') return rects;
    const mouth = rects.filter((r) => r.c === PALETTE.m);
    let out = rects.filter((r) => r.c !== PALETTE.c);      // 볼터치 제거(창백해짐)
    if (mouth.length) {
      const y = Math.min(...mouth.map((r) => r.y));
      const xs = mouth.map((r) => r.x);
      out = out.concat([                                    // 입꼬리 축 처짐(︵)
        { x: Math.min(...xs) - 1, y: y + 1, c: PALETTE.m },
        { x: Math.max(...xs) + 1, y: y + 1, c: PALETTE.m },
      ]);
    }
    if (mood === 'starving') {
      out = out.map((r) => (r.c === PALETTE.e ? { ...r, c: '#8E8577' } : r)); // 눈이 풀림
    }
    return out;
  }, [rects, mood]);

  return (
    <svg
      width={w * scale} height={h * scale}
      viewBox={`${minX} ${minY} ${w} ${h}`}
      style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges', display: 'block' }}
      aria-hidden
    >
      {drawn.map((r, i) => <rect key={i} x={r.x} y={r.y} width="1" height="1" fill={r.c} />)}
    </svg>
  );
}
