// =========================================================
// 픽셀 메시지 비트맵 인코딩
//   기기(ESP32)의 src/Poke.cpp 디코더와 바이트 단위로 맞춰야 한다.
//
//   패킹  : 행 우선, 바이트당 8픽셀, MSB가 왼쪽 픽셀. stride = ceil(w/8)
//   RLE   : 행 우선 선형 인덱스(y*w + x) 위의 교대 런. OFF 런부터 시작한다.
//           런 길이는 0~255. 255를 넘으면 255 → 0(반대색 0길이) → 나머지로 쪼갠다.
//   전송  : 위 바이트열을 base64. RLE가 raw보다 크면 raw로 보낸다.
//
// 64x32 기준 raw는 항상 256B이므로 페이로드는 base64 344자를 넘지 않는다.
// (기기의 MQTT_MAX_PACKET_SIZE=1024 안에 토픽·헤더까지 충분히 들어간다)
// =========================================================

export const MSG_W = 64;
export const MSG_H = 32;

// ---- 인코딩 ---------------------------------------------------------------

// px: Uint8Array(w*h), 0 또는 1
export function packBits(px, w, h) {
  const stride = (w + 7) >> 3;
  const out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[y * w + x]) out[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

export function rleBits(px, w, h) {
  const total = w * h;
  const out = [];
  const push = (n) => {
    let r = n;
    while (r > 255) { out.push(255, 0); r -= 255; }
    out.push(r);
  };

  let color = 0; // 첫 런은 OFF
  let run = 0;
  for (let i = 0; i < total; i++) {
    const v = px[i] ? 1 : 0;
    if (v === color) { run++; continue; }
    push(run);
    color ^= 1;
    run = 1;
  }
  // 마지막 런이 OFF면 생략한다 — 디코더가 total에서 알아서 멈춘다
  if (color) push(run);
  return Uint8Array.from(out);
}

const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

const fromBase64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

// 둘 중 짧은 표현을 고른다 → { enc: 'r' | 'b', d: base64, bytes: 원본 길이 }
export function encodeBitmap(px, w = MSG_W, h = MSG_H) {
  const raw = packBits(px, w, h);
  const rle = rleBits(px, w, h);
  return rle.length < raw.length
    ? { enc: 'r', d: toBase64(rle), bytes: rle.length }
    : { enc: 'b', d: toBase64(raw), bytes: raw.length };
}

// ---- 디코딩 (웹에서 받은 그림을 미리보기할 때) ------------------------------

export function decodeBitmap({ enc, d, w = MSG_W, h = MSG_H }) {
  const px = new Uint8Array(w * h);
  if (!d) return px;
  let bytes;
  try { bytes = fromBase64(d); } catch { return px; }

  if (enc === 'b') {
    const stride = (w + 7) >> 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        px[y * w + x] = (bytes[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
      }
    }
    return px;
  }

  let pos = 0;
  let color = 0;
  for (let i = 0; i < bytes.length && pos < px.length; i++) {
    const run = bytes[i];
    if (color) {
      for (let k = 0; k < run && pos < px.length; k++) px[pos++] = 1;
    } else {
      pos = Math.min(px.length, pos + run);
    }
    color ^= 1;
  }
  return px;
}

// ---- 그리기 프리미티브 -----------------------------------------------------

export const setPx = (px, w, h, x, y, v) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  px[y * w + x] = v;
};

// 굵기 size의 정사각 브러시
export const stamp = (px, w, h, cx, cy, size, v) => {
  const r = Math.floor((size - 1) / 2);
  for (let dy = -r; dy <= size - 1 - r; dy++) {
    for (let dx = -r; dx <= size - 1 - r; dx++) setPx(px, w, h, cx + dx, cy + dy, v);
  }
};

// 브레젠험 직선 — 포인터 이벤트가 띄엄띄엄 들어와도 획이 끊기지 않게 한다
export const plotLine = (px, w, h, x0, y0, x1, y1, size, v) => {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    stamp(px, w, h, x, y, size, v);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
};

// ---- 프리셋 스탬프 ---------------------------------------------------------
// 첫 사용에서 바로 뭔가 보낼 수 있게 하는 용도(촬영에도 유용).

const HEART = [
  '..###...###..',
  '.#####.#####.',
  '#############',
  '#############',
  '#############',
  '.###########.',
  '..#########..',
  '...#######...',
  '....#####....',
  '.....###.....',
  '......#......',
];

const BANG = [
  '####',
  '####',
  '####',
  '####',
  '####',
  '####',
  '####',
  '####',
  '####',
  '....',
  '....',
  '####',
  '####',
  '####',
];

// 문자 그리드를 캔버스 중앙에 찍는다
const stampMap = (px, w, h, map, scale = 1) => {
  const mh = map.length;
  const mw = map[0].length;
  const ox = Math.floor((w - mw * scale) / 2);
  const oy = Math.floor((h - mh * scale) / 2);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (map[y][x] !== '#') continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) setPx(px, w, h, ox + x * scale + sx, oy + y * scale + sy, 1);
      }
    }
  }
};

// 미드포인트 원(외곽선만)
const circle = (px, w, h, cx, cy, r, thick = 1) => {
  for (let t = 0; t < thick; t++) {
    const rr = r - t;
    let x = rr;
    let y = 0;
    let err = 1 - rr;
    while (x >= y) {
      const pts = [[x, y], [y, x], [-x, y], [-y, x], [-x, -y], [-y, -x], [x, -y], [y, -x]];
      pts.forEach(([dx, dy]) => setPx(px, w, h, cx + dx, cy + dy, 1));
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  }
};

const smile = (px, w, h) => {
  const cx = w >> 1;
  const cy = h >> 1;
  const r = Math.floor(Math.min(w, h) / 2) - 2;
  circle(px, w, h, cx, cy, r, 2);
  stamp(px, w, h, cx - Math.floor(r / 2), cy - Math.floor(r / 3), 3, 1); // 왼눈
  stamp(px, w, h, cx + Math.floor(r / 2), cy - Math.floor(r / 3), 3, 1); // 오른눈
  for (let x = -Math.floor(r / 2); x <= Math.floor(r / 2); x++) {        // 입(아래로 볼록)
    const y = Math.round(cy + r / 2 - (x * x) / (r * 1.6));
    setPx(px, w, h, cx + x, y, 1);
    setPx(px, w, h, cx + x, y + 1, 1);
  }
};

export const PRESETS = [
  { id: 'heart', label: '하트', apply: (px, w, h) => stampMap(px, w, h, HEART, 2) },
  { id: 'smile', label: '스마일', apply: smile },
  { id: 'bang', label: '느낌표', apply: (px, w, h) => stampMap(px, w, h, BANG, 2) },
];
