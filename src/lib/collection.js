// =========================================================
// 실물 클리커 콜렉션 — 캡처한 캐릭터 저장(localStorage)
//   목록: tc:cap:<myId> = [{ id, name, img(dataURL), w, h, ts }]
//   출전 캐릭터: tc:capsel:<myId> = id (없으면 기본 딤섬이)
// =========================================================

export const MAX_CAPTURES = 12;

const LIST_KEY = (myId) => 'tc:cap:' + myId;
const SEL_KEY = (myId) => 'tc:capsel:' + myId;

export const loadCaptures = (myId) => {
  try { return JSON.parse(localStorage.getItem(LIST_KEY(myId))) || []; } catch { return []; }
};

export const saveCaptures = (myId, list) => {
  try { localStorage.setItem(LIST_KEY(myId), JSON.stringify(list)); } catch { /* ignore */ }
};

export const loadSelectedId = (myId) => {
  try { return localStorage.getItem(SEL_KEY(myId)) || null; } catch { return null; }
};

export const saveSelectedId = (myId, id) => {
  try {
    if (id) localStorage.setItem(SEL_KEY(myId), id);
    else localStorage.removeItem(SEL_KEY(myId));
  } catch { /* ignore */ }
};
