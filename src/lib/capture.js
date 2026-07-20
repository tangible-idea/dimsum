// =========================================================
// 실물 클리커 사진 → 배경 제거 → 픽셀 스프라이트 캡처
//   - 가장자리에서 시작하는 flood-fill(이웃 색 연속성)로 배경을 지운다
//   - 결과는 저해상도 픽셀 스프라이트(dataURL)로 축소해 localStorage에 저장
// =========================================================

const WORK_SIZE = 320;   // 배경 제거 작업 해상도(최대 변)
const SPRITE_SIZE = 48;  // 저장 스프라이트 해상도(최대 변)

// 파일 → 작업용 캔버스(축소 렌더)
export const loadSource = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, WORK_SIZE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    resolve(cv);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했어요')); };
  img.src = url;
});

// 배경 제거 + 크롭 + 스프라이트 축소. 실패(피사체를 못 찾음) 시 null.
// tolerance: 이웃 픽셀과 이 정도(채널당) 이내로 이어지면 같은 배경으로 본다.
export const cutout = (src, tolerance = 26) => {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h);
  const px = data.data;

  // 가장자리 픽셀을 그대로 시드로 쓰면 프레임에 걸친 피사체까지 배경으로 먹힌다.
  // → 가장자리 색의 '중앙값'으로 1px 테두리를 덧대고, 그 테두리에서만 flood-fill 시작.
  //   테두리는 배경색이므로 배경으로는 번지고, 색이 다른 피사체에서는 멈춘다.
  const edge = [[], [], []];
  const push = (i) => { edge[0].push(px[i]); edge[1].push(px[i + 1]); edge[2].push(px[i + 2]); };
  for (let x = 0; x < w; x++) { push((x) * 4); push(((h - 1) * w + x) * 4); }
  for (let y = 0; y < h; y++) { push((y * w) * 4); push((y * w + w - 1) * 4); }
  const median = edge.map((ch) => { ch.sort((a, b) => a - b); return ch[ch.length >> 1]; });

  const PW = w + 2;
  const PH = h + 2;
  // 패딩 좌표 → RGB 조회 (테두리는 중앙값 색)
  const rgb = (pi) => {
    const x = pi % PW;
    const y = (pi / PW) | 0;
    if (x === 0 || y === 0 || x === PW - 1 || y === PH - 1) return median;
    const i = ((y - 1) * w + (x - 1)) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const tol2 = tolerance * tolerance * 3;
  const near = (a, b) => {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return dr * dr + dg * dg + db * db <= tol2;
  };

  const pbg = new Uint8Array(PW * PH);
  const queue = [];
  const seed = (pi) => { if (!pbg[pi]) { pbg[pi] = 1; queue.push(pi); } };
  for (let x = 0; x < PW; x++) { seed(x); seed((PH - 1) * PW + x); }
  for (let y = 0; y < PH; y++) { seed(y * PW); seed(y * PW + PW - 1); }
  while (queue.length) {
    const pi = queue.pop();
    const x = pi % PW;
    const y = (pi / PW) | 0;
    const c = rgb(pi);
    if (x > 0 && !pbg[pi - 1] && near(c, rgb(pi - 1))) { pbg[pi - 1] = 1; queue.push(pi - 1); }
    if (x < PW - 1 && !pbg[pi + 1] && near(c, rgb(pi + 1))) { pbg[pi + 1] = 1; queue.push(pi + 1); }
    if (y > 0 && !pbg[pi - PW] && near(c, rgb(pi - PW))) { pbg[pi - PW] = 1; queue.push(pi - PW); }
    if (y < PH - 1 && !pbg[pi + PW] && near(c, rgb(pi + PW))) { pbg[pi + PW] = 1; queue.push(pi + PW); }
  }

  // 패딩 좌표 → 원본 좌표로 되돌림
  const bg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) bg[y * w + x] = pbg[(y + 1) * PW + (x + 1)];
  }

  // 남은 피사체의 바운딩 박스
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1; let kept = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!bg[i] && px[i * 4 + 3] > 40) {
        kept += 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  // 너무 작거나(노이즈뿐) 화면 전체가 남으면(배경을 못 지움) 실패로 처리
  if (kept < 40 || x1 < x0 || kept > w * h * 0.92) return null;

  for (let i = 0; i < w * h; i++) if (bg[i]) px[i * 4 + 3] = 0;
  const cut = document.createElement('canvas');
  cut.width = w; cut.height = h;
  cut.getContext('2d').putImageData(data, 0, 0);

  // 크롭 → 픽셀 스프라이트로 축소
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const s = Math.min(1, SPRITE_SIZE / Math.max(cw, ch));
  const ow = Math.max(1, Math.round(cw * s));
  const oh = Math.max(1, Math.round(ch * s));
  const out = document.createElement('canvas');
  out.width = ow; out.height = oh;
  const octx = out.getContext('2d');
  octx.drawImage(cut, x0, y0, cw, ch, 0, 0, ow, oh);
  // 알파 이진화 → 또렷한 픽셀 경계
  const od = octx.getImageData(0, 0, ow, oh);
  for (let i = 3; i < od.data.length; i += 4) od.data[i] = od.data[i] > 110 ? 255 : 0;
  octx.putImageData(od, 0, 0);
  return { img: out.toDataURL('image/png'), w: ow, h: oh };
};
