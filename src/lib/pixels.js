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

// ---- 성장 단계(총 탭 기준) --------------------------------------------------
// meta: cx 중심열, headRow 모자 밑단 행, eyeRow/eyeL/eyeR 눈 위치, neckRow 목 장식 밑단 행
export const STAGES = [
  {
    min: 0, name: '아기 딤섬', px: 9,
    cx: 7, headRow: 1, eyeRow: 4, eyeL: 4, eyeR: 9, neckRow: 8,
    map: [
      '......oo......',
      '....oobboo....',
      '..oobbbbbboo..',
      '.obbbbbbbbbbo.',
      '.obbebbbbebbo.',
      'obbbbbmmbbbbbo',
      'obcbbbbbbbbcbo',
      '.obbbbbbbbbbo.',
      '.oobbbbbbbboo.',
      '...obssssbo...',
      '....oooooo....',
    ],
  },
  {
    min: 500, name: '딤섬 소년', px: 9,
    cx: 9, headRow: 1, eyeRow: 6, eyeL: 5, eyeR: 12, neckRow: 11,
    map: [
      '.......oooo.......',
      '.....oobbbboo.....',
      '....obbbbbbbbo....',
      '..oobbbbbbbbbboo..',
      '.obbbbbbbbbbbbbbo.',
      '.obhbbbbbbbbbbbbo.',
      'obbbbebbbbbbebbbbo',
      'obbbbbbbmmbbbbbbbo',
      'obcbbbbbbbbbbbcbbo',
      '.obbbbbbbbbbbbbbo.',
      '.oobbbbbbbbbbbboo.',
      '..oobbbbbbbbbboo..',
      '....obssssssbo....',
      '.....oooooooo.....',
    ],
  },
  {
    min: 5000, name: '왕딤섬', px: 9,
    cx: 10, headRow: 2, eyeRow: 8, eyeL: 5, eyeR: 14, neckRow: 13,
    map: [
      '........oooo........',
      '.......obbbbo.......',
      '.....oobsbbsboo.....',
      '....obbbbbbbbbbo....',
      '...obbbbbbbbbbbbo...',
      '..obbbbbbbbbbbbbbo..',
      '.obbbbbbbbbbbbbbbbo.',
      '.obhbbbbbbbbbbbbbbo.',
      'obbbbebbbbbbbbebbbbo',
      'obbbbbbbbbbbbbbbbbbo',
      'obbcbbbbbmmbbbbbcbbo',
      '.obbbbbbbbbbbbbbbbo.',
      '.oobbbbbbbbbbbbbboo.',
      '..oobbbbbbbbbbbboo..',
      '....oobssssssboo....',
      '......oooooooo......',
    ],
  },
];

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

// gen 악세서리도 도감/보상 카드에서 미리보기 가능하도록 대표 맵 부여(왕딤섬 기준)
ACCESSORIES.forEach((a) => { if (a.gen && !a.map) a.map = a.gen(STAGES[2]).map; });

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
