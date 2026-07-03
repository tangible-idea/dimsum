// =========================================================
// 소비 아이템(냉장고) — public/assets/consumables 스프라이트
// =========================================================

const DIR = '/assets/consumables/';

export const CONSUMABLES = [
  // 우유·음료 -------------------------------------------------
  { id: 'milk',          name: '우유',        file: 'milk.png' },
  { id: 'condensed',     name: '연유',        file: 'condensed.png' },
  { id: 'goat_milk',     name: '산양유',      file: 'goat_milk.png' },
  { id: 'mini_milk',     name: '미니 우유',   file: 'mini_milk.png' },
  { id: 'yogurt',        name: '수제 요거트', file: 'yogurt.png' },
  { id: 'soy_milk',      name: '두유',        file: 'soy_milk.png' },
  { id: 'jasmine_tea',   name: '자스민 차',   file: 'jasmine_tea.png' },
  // 음식 -------------------------------------------------------
  { id: 'dumpling',      name: '찐만두',      file: 'dumpling.png' },
  { id: 'king_dumpling', name: '왕만두',      file: 'king_dumpling.png' },
  { id: 'steamed_fish',  name: '생선찜',      file: 'steamed_fish.png' },
  { id: 'soy_sauce',     name: '간장',        file: 'soy_sauce.png' },
  // 두루마리·문서 ----------------------------------------------
  { id: 'secret_recipe', name: '비밀 레시피',   file: 'secret_recipe.png' },
  { id: 'blueprint',     name: '딤섬 설계도',   file: 'blueprint.png' },
  { id: 'lucky_scroll',  name: '행운의 족보',   file: 'lucky_scroll.png' },
  { id: 'treasure_map',  name: '보물 지도',     file: 'treasure_map.png' },
  { id: 'cook_manual',   name: '요리 비급',     file: 'cook_manual.png' },
  { id: 'magic_scroll',  name: '마법 주문서',   file: 'magic_scroll.png' },
  { id: 'old_letter',    name: '오래된 편지',   file: 'old_letter.png' },
  { id: 'gold_edict',    name: '황금 칙서',     file: 'gold_edict.png' },
  { id: 'spicy_recipe',  name: '매운맛 레시피', file: 'spicy_recipe.png' },
  { id: 'hanging_scroll',name: '족자',          file: 'hanging_scroll.png' },
  { id: 'herb_recipe',   name: '허브 레시피',   file: 'herb_recipe.png' },
  { id: 'worn_scroll',   name: '낡은 두루마리', file: 'worn_scroll.png' },
  { id: 'flame_charm',   name: '불꽃 부적',     file: 'flame_charm.png' },
  { id: 'red_letter',    name: '붉은 서신',     file: 'red_letter.png' },
];

export const CONSUMABLE_BY_ID = Object.fromEntries(CONSUMABLES.map((c) => [c.id, c]));
export const consumableSrc = (c) => DIR + c.file;

// 진화 재료: 레벨마다 음식/음료 11종을 순환 (정답은 힌트로만 암시)
export const EVOLUTION_FOODS = [
  'milk', 'king_dumpling', 'dumpling', 'jasmine_tea', 'yogurt',
  'steamed_fish', 'soy_milk', 'condensed', 'goat_milk', 'mini_milk', 'soy_sauce',
];
export const evolutionFoodId = (level) => EVOLUTION_FOODS[level % EVOLUTION_FOODS.length];

export const FOOD_HINTS = {
  milk: '하얗고 고소한 음료가 마시고 싶대요',
  king_dumpling: '자기보다 커다란 왕(王)을 동경하고 있대요',
  dumpling: '김이 모락모락 나는 초록 잎사귀 친구가 궁금하대요',
  jasmine_tea: '향긋한 꽃향기가 나는 따뜻한 것이 마시고 싶대요',
  yogurt: '새콤하고 걸쭉한 수제 간식을 꿈꾸고 있어요',
  steamed_fish: '바다에서 온 노란 고명의 요리가 먹고 싶대요',
  soy_milk: '콩으로 만든 구수한 음료가 당긴대요',
  condensed: '아주아주 달콤하고 진득한 우유가 필요하대요',
  goat_milk: '산에서 온 특별한 우유를 마셔보고 싶대요',
  mini_milk: '작고 귀여운 한 모금이면 충분하대요',
  soy_sauce: '짭짤한 검은 소스에 콕 찍어 먹고 싶대요',
};

// 신규 유저 기본 지급(냉장고 시작 구성 — 오답 소모를 감안해 여분 포함)
export const STARTER_FRIDGE = { milk: 2, king_dumpling: 2, dumpling: 1, jasmine_tea: 1 };
