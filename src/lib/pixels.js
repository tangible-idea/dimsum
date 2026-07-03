// =========================================================
// 픽셀 딤섬 다마고치 — 스프라이트 데이터
// 문자 그리드 → 색상 팔레트 매핑. 외부 이미지 에셋 없음.
// =========================================================

export const PALETTE = {
  o: '#433526', // 외곽선
  b: '#F6E7CB', // 딤섬 몸통
  s: '#E4CCA3', // 그림자(아랫면)
  h: '#FCF4E2', // 하이라이트
  e: '#3A2E22', // 눈
  m: '#C05B3C', // 입
  c: '#F4B3A3', // 볼터치
  r: '#D9534F', // 빨강
  d: '#A93A32', // 진한 빨강
  p: '#EF8FA4', // 핑크
  w: '#FFFFFF', // 흰색
  g: '#E8B44F', // 골드
  k: '#2A2D35', // 먹색
  u: '#5B8FB9', // 블루
  l: '#7FA76B', // 그린
  y: '#F2D06B', // 옐로우
};

// ---- 성장 단계: 50레벨 × 변형 2종 = 100형태 프로시저럴 생성 -----------------
// 각 레벨은 { min, variants: [형태A, 형태B] }.
// 진화할 때마다 두 변형 중 하나가 랜덤으로 선택된다.
// 형태 meta: cx 중심열(악세서리 기준), headRow/eyeRow/eyeL/eyeR/neckRow,
//            palette: 몸통 틴트(b/s/h) 오버라이드

// 변형별 몸통 틴트 [몸통 b, 그림자 s, 하이라이트 h]
const TINTS = [
  { b: '#F6E7CB', s: '#E4CCA3', h: '#FCF4E2' }, // 크림
  { b: '#F9DFD6', s: '#E9BCAC', h: '#FDF0EA' }, // 복숭아
  { b: '#E3EBD3', s: '#C2D1A6', h: '#F2F7E8' }, // 말차
  { b: '#EFE0F1', s: '#D3BAD8', h: '#F9F0FA' }, // 타로
  { b: '#F7E7B9', s: '#E3C97E', h: '#FCF3D9' }, // 커스터드
  { b: '#F0E4D6', s: '#D8C2A8', h: '#F9F2E9' }, // 통밀
  { b: '#DCE9EF', s: '#B4CEDC', h: '#EEF6FA' }, // 하늘
  { b: '#F3D9DF', s: '#DFB3BE', h: '#FAECEF' }, // 벚꽃
];

const ADJ = [
  '아기', '몽글몽글', '말랑', '쫀득', '포동포동', '꼬마', '수줍은', '발랄한', '졸린', '반질반질',
  '김폴폴', '오동통', '씩씩한', '야무진', '통통', '반짝', '솜사탕', '의젓한', '구름', '달빛',
  '햇살', '바람', '이슬', '눈꽃', '별빛', '노을', '안개', '미소', '복슬복슬', '동글동글',
  '늠름한', '용감한', '슬기로운', '재빠른', '느긋한', '단단한', '푸짐한', '고소한', '달콤한', '향긋한',
  '전설의', '신비한', '우아한', '찬란한', '위대한', '장엄한', '유서깊은', '불멸의', '초월한', '태초의',
];
const BASE = ['딤섬', '찐빵', '만두', '바오', '슈마이', '완탕', '하가우', '샤오롱바오', '춘권', '포자'];

// 레벨×변형 → 픽셀 형태 생성
const genForm = (level, variant) => {
  const w = 12 + 2 * Math.floor(level * 0.25);            // 12 → 36 (짝수 유지)
  const h = Math.round(w * 0.8);
  const rx = (w - 1) / 2;
  const ry = (h - 1) / 2;
  const cxF = (w - 1) / 2;                                 // 실제 중심(X.5)
  const grid = Array.from({ length: h }, () => Array(w).fill('.'));

  // 타원 몸통 (반경을 살짝 키워 첫/끝 행까지 채움)
  const halfAt = (y) => (rx + 0.3) * Math.sqrt(Math.max(0, 1 - ((y - ry) / (ry + 0.55)) ** 2));
  for (let y = 0; y < h; y++) {
    const half = halfAt(y);
    if (half < 0.5) continue;
    const x0 = Math.round(cxF - half);
    const x1 = Math.round(cxF + half);
    for (let x = x0; x <= x1; x++) grid[y][x] = 'b';
  }
  // 외곽선: 바깥과 맞닿은 몸통 픽셀
  const inBody = (x, y) => y >= 0 && y < h && x >= 0 && x < w && grid[y][x] !== '.';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] === 'b' && (!inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1))) {
        grid[y][x] = 'o';
      }
    }
  }
  // 아랫면 그림자 / 하이라이트
  for (let x = 0; x < w; x++) if (grid[h - 2][x] === 'b') grid[h - 2][x] = 's';
  const hx = Math.round(cxF - rx * 0.45);
  for (let x = hx; x <= hx + 1; x++) if (grid[2]?.[x] === 'b') grid[2][x] = 'h';

  // 얼굴 (표정 패치가 색으로 찾으므로 e/m/c 문자는 공통 팔레트 유지)
  const eyeRow = Math.round(h * 0.42);
  const eyeL = Math.round(cxF - Math.max(2, Math.round(w * 0.18)));
  const eyeR = w - 1 - eyeL;
  if (grid[eyeRow][eyeL] === 'b') grid[eyeRow][eyeL] = 'e';
  if (grid[eyeRow][eyeR] === 'b') grid[eyeRow][eyeR] = 'e';
  const mouthRow = eyeRow + Math.max(1, Math.round(h * 0.12));
  const mx = Math.floor(cxF);
  if (grid[mouthRow]?.[mx] === 'b') grid[mouthRow][mx] = 'm';
  if (grid[mouthRow]?.[mx + 1] === 'b') grid[mouthRow][mx + 1] = 'm';
  [eyeL - 2, eyeR + 2].forEach((x) => { if (grid[mouthRow]?.[x] === 'b') grid[mouthRow][x] = 'c'; });

  // 변형 장식: 민무늬 / 잎사귀 / 참깨 / 주름 / 꼭지
  const deco = (level * 2 + variant) % 5;
  if (deco === 1) { // 잎사귀
    const lx = Math.round(cxF + 2);
    [[1, lx], [1, lx + 1], [0, lx + 2], [1, lx + 3]].forEach(([y, x]) => { if (grid[y]?.[x]) grid[y][x] = 'l'; });
  } else if (deco === 2) { // 참깨
    [[2, Math.round(cxF)], [eyeRow - 2, Math.round(cxF - 3)], [eyeRow - 2, Math.round(cxF + 3)]]
      .forEach(([y, x]) => { if (grid[y]?.[x] === 'b') grid[y][x] = 'k'; });
  } else if (deco === 3) { // 찜기 주름
    for (let x = 0; x < w; x += 2) if (grid[1][x] === 'b') grid[1][x] = 's';
  } else if (deco === 4) { // 꼭지(찐빵 매듭)
    [[1, Math.floor(cxF) - 1], [1, Math.floor(cxF) + 2]].forEach(([y, x]) => { if (grid[y]?.[x] === 'b') grid[y][x] = 's'; });
  }

  const adjIdx = (level * 2 + variant) % ADJ.length;
  const baseIdx = Math.floor(level / 5) % BASE.length;
  return {
    name: `${ADJ[adjIdx]} ${BASE[baseIdx]}`,
    px: Math.max(4, Math.min(9, Math.round(120 / h))),
    cx: w / 2, headRow: 1, eyeRow, eyeL, eyeR,
    neckRow: Math.round(h * 0.72),
    palette: TINTS[(level + variant * 3) % TINTS.length],
    map: grid.map((row) => row.join('')),
  };
};

export const STAGES = Array.from({ length: 50 }, (_, level) => ({
  min: 250 * level * level + 250 * level,   // 0, 500, 1500, 3000, 5000, ...
  variants: [genForm(level, 0), genForm(level, 1)],
}));

export const stageOf = (total) => {
  let idx = 0;
  STAGES.forEach((s, i) => { if (total >= s.min) idx = i; });
  return idx;
};

// ---- 악세서리(퀘스트 보상 → 착용) ------------------------------------------
// slot: head(머리) / face(얼굴) / neck(목)
// 안경류는 단계별 눈 좌표에 맞춰 동적 생성(gen)
const genGlasses = (stage) => {
  const { eyeL, eyeR } = stage;
  const x = eyeL - 1;
  const w = eyeR + 2 - x;
  const r0 = Array(w).fill('.');
  const r1 = Array(w).fill('.');
  const r2 = Array(w).fill('.');
  [eyeL, eyeR].forEach((E) => {
    const c = E - x;
    [c - 1, c, c + 1].forEach((i) => { r0[i] = 'k'; r2[i] = 'k'; });
    r1[c - 1] = 'k'; r1[c + 1] = 'k';
  });
  for (let i = eyeL + 2 - x; i <= eyeR - 2 - x; i++) r1[i] = 'k';
  return { map: [r0.join(''), r1.join(''), r2.join('')], x, y: stage.eyeRow - 1 };
};
const genSunglasses = (stage) => {
  const { eyeL, eyeR } = stage;
  const x = eyeL - 2;
  const w = eyeR + 3 - x;
  const r0 = Array(w).fill('k');
  const r1 = Array(w).fill('.');
  [eyeL, eyeR].forEach((E) => {
    const c = E - x;
    [c - 1, c, c + 1].forEach((i) => { r1[i] = 'k'; });
  });
  return { map: [r0.join(''), r1.join('')], x, y: stage.eyeRow - 1 };
};

export const ACC_RARITY = {
  common: { label: '일반', weight: 70 },
  rare: { label: '희귀', weight: 25 },
  epic: { label: '전설', weight: 5 },
};

export const ACCESSORIES = [
  {
    id: 'ribbon', name: '빨간 리본', slot: 'head', rarity: 'common', dy: 0,
    map: [
      '.rr...rr.',
      'rrrr.rrrr',
      'rrrrdrrrr',
      '.rr.d.rr.',
    ],
  },
  {
    id: 'pinkbow', name: '핑크 리본', slot: 'head', rarity: 'common', dy: 0,
    map: [
      '.pp...pp.',
      'pppp.pppp',
      'ppppwpppp',
      '.pp.w.pp.',
    ],
  },
  {
    id: 'flower', name: '들꽃', slot: 'head', rarity: 'common', dy: 0, dx: -4,
    map: [
      '.w.w.',
      'wwyww',
      '.w.w.',
    ],
  },
  {
    id: 'sprout', name: '새싹', slot: 'head', rarity: 'common', dy: 0,
    map: [
      '.l.l.',
      'll.ll',
      '..l..',
      '..l..',
    ],
  },
  {
    id: 'bowtie', name: '나비넥타이', slot: 'neck', rarity: 'common', dy: 0,
    map: [
      'uu..k..uu',
      'uuuukuuuu',
      'uu..k..uu',
    ],
  },
  {
    id: 'scarf', name: '포근 목도리', slot: 'neck', rarity: 'common', dy: 0,
    map: [
      'rrrrrrrrrr',
      '..dd......',
      '..dd......',
    ],
  },
  {
    id: 'glasses', name: '동글 안경', slot: 'face', rarity: 'common', gen: genGlasses,
  },
  {
    id: 'beret', name: '베레모', slot: 'head', rarity: 'rare', dy: 0,
    map: [
      '.....r.....',
      '..rrrrrrr..',
      '.rrrrrrrrr.',
      'rrrrrrrrrrr',
    ],
  },
  {
    id: 'tophat', name: '신사 탑햇', slot: 'head', rarity: 'rare', dy: 0,
    map: [
      '..kkkkkkk..',
      '..kkkkkkk..',
      '..kkkkkkk..',
      '..kgggggk..',
      'kkkkkkkkkkk',
    ],
  },
  {
    id: 'sunglasses', name: '선글라스', slot: 'face', rarity: 'rare', gen: genSunglasses,
  },
  {
    id: 'pearls', name: '진주 목걸이', slot: 'neck', rarity: 'rare', dy: 0,
    map: [
      'y.........y',
      '.w.......w.',
      '..y.y.y.y..',
    ],
  },
  {
    id: 'crown', name: '황금 왕관', slot: 'head', rarity: 'epic', dy: 0,
    map: [
      'g..g.g..g',
      'gg.ggg.gg',
      'ggggggggg',
      'ggggggggg',
    ],
  },
  {
    id: 'halo', name: '천사 링', slot: 'head', rarity: 'epic', dy: -2,
    map: [
      '.ggggggg.',
      'g.......g',
      '.ggggggg.',
    ],
  },
];

// gen 악세서리도 도감/보상 카드에서 미리보기 가능하도록 대표 맵 부여(3레벨 A형 기준)
ACCESSORIES.forEach((a) => { if (a.gen && !a.map) a.map = a.gen(STAGES[2].variants[0]).map; });

export const accById = (id) => ACCESSORIES.find((a) => a.id === id) || null;

export const rollAccessory = () => {
  const r = Math.random() * 100;
  const tier = r < ACC_RARITY.epic.weight
    ? 'epic'
    : r < ACC_RARITY.epic.weight + ACC_RARITY.rare.weight ? 'rare' : 'common';
  const pool = ACCESSORIES.filter((a) => a.rarity === tier);
  return pool[Math.floor(Math.random() * pool.length)];
};

// 악세서리를 스테이지 그리드에 배치: { map, x, y }
// head: 밑단이 headRow에 닿게 / face: 눈 행 중심 / neck: 밑단이 neckRow에 닿게
export const accPlacement = (stage, acc) => {
  if (acc.gen) return acc.gen(stage);
  const w = acc.map[0].length;
  const h = acc.map.length;
  // 몸통 맵은 짝수 폭(실제 중심 = cx - 0.5)이라 정수 배치로는 홀수 폭 악세서리가
  // 반 픽셀 오른쪽으로 치우침 → 실제 중심 기준으로 배치(SVG라 0.5 오프셋 허용)
  const x = stage.cx - 0.5 - (w - 1) / 2 + (acc.dx || 0);
  let y;
  if (acc.slot === 'head') y = stage.headRow - h + 1 + (acc.dy || 0);
  else if (acc.slot === 'face') y = stage.eyeRow - 1 + (acc.dy || 0);
  else y = stage.neckRow - h + 1 + (acc.dy || 0);
  return { map: acc.map, x, y };
};
