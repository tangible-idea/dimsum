// 공용 라인 아이콘. 규격을 한 곳에 모아 두께·크기가 어긋나지 않게 한다.
//   viewBox 24 / stroke 1.6 / currentColor
// 아이콘만 있는 버튼에는 반드시 aria-label과 title을 붙일 것.

export const Icon = ({ size = 22, children, ...p }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" {...p}
  >
    {children}
  </svg>
);

// ---- 하단 탭 ---------------------------------------------------------------
export const IconMail = (p) => (
  <Icon size={23} {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.6" />
    <path d="M3.4 7.6l7.3 5a2.3 2.3 0 0 0 2.6 0l7.3-5" />
  </Icon>
);

// 찐만두: 둥근 몸통 + 주름 + 위 매듭. 매듭이 없으면 우산처럼 보인다.
export const IconDumpling = (p) => (
  <Icon size={23} {...p}>
    <path d="M4.3 18.4a7.7 7.7 0 0 1 15.4 0Z" />
    <path d="M2.6 18.4h18.8" />
    <path d="M9.5 18.4c0-2.7.4-4.9 1.1-6.4" />
    <path d="M14.5 18.4c0-2.7-.4-4.9-1.1-6.4" />
    <circle cx="12" cy="10.4" r="1.35" />
  </Icon>
);

export const IconGamepad = (p) => (
  <Icon size={23} {...p}>
    <rect x="2.5" y="7.5" width="19" height="10" rx="4.6" />
    <path d="M7 10.6v2.8" /><path d="M5.6 12h2.8" />
    <circle cx="16" cy="11.2" r=".95" fill="currentColor" stroke="none" />
    <circle cx="18.3" cy="13.6" r=".95" fill="currentColor" stroke="none" />
  </Icon>
);

// ---- 그리기 도구 -----------------------------------------------------------
export const IconPencil = (p) => (
  <Icon {...p}>
    <path d="M4 20.2h4.1L18.7 9.6a2.55 2.55 0 0 0-3.6-3.6L4.5 16.6 4 20.2Z" />
    <path d="M14.4 6.9l3.6 3.6" />
  </Icon>
);

export const IconEraser = (p) => (
  <Icon {...p}>
    <path d="M15.2 4.6 4.9 14.9a2 2 0 0 0 0 2.8l2.4 2.4h4.4l8.4-8.4a2 2 0 0 0 0-2.8L18 4.6a2 2 0 0 0-2.8 0Z" />
    <path d="M11.7 20.1H21" />
    <path d="M9.4 10.1l5.6 5.6" />
  </Icon>
);

export const IconUndo = (p) => (
  <Icon {...p}>
    <path d="M4.5 9.5h9.5a5 5 0 0 1 0 10H8.5" />
    <path d="M8.2 5.2 4 9.5l4.2 4.3" />
  </Icon>
);

export const IconTrash = (p) => (
  <Icon {...p}>
    <path d="M4 7h16" />
    <path d="M9.2 7V5.6A1.6 1.6 0 0 1 10.8 4h2.4a1.6 1.6 0 0 1 1.6 1.6V7" />
    <path d="M6.6 7l.8 12.1a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.4 7" />
  </Icon>
);

// 브러시 굵기 — 점 크기로 표현한다. 숫자보다 결과가 바로 읽힌다.
export const IconDot = ({ r = 3, ...p }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r={r} fill="currentColor" stroke="none" />
  </Icon>
);

export const IconSend = (p) => (
  <Icon {...p}>
    <path d="M20.8 3.2 3.4 10.1l6.5 2.7 2.7 6.5 8.2-16.1Z" />
    <path d="M9.9 12.8 20.8 3.2" />
  </Icon>
);

export const IconClose = (p) => (
  <Icon {...p}>
    <path d="M6.2 6.2l11.6 11.6" />
    <path d="M17.8 6.2 6.2 17.8" />
  </Icon>
);

// ---- 프리셋 스탬프 (내용 자체가 아이콘이라 그대로 읽힌다) --------------------
export const IconHeart = (p) => (
  <Icon {...p}>
    <path d="M12 19.6S4.4 14.9 4.4 9.9A3.85 3.85 0 0 1 12 8a3.85 3.85 0 0 1 7.6 1.9c0 5-7.6 9.7-7.6 9.7Z" />
  </Icon>
);

export const IconSmile = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M8.6 14.1a4.2 4.2 0 0 0 6.8 0" />
    <circle cx="9.4" cy="10" r=".95" fill="currentColor" stroke="none" />
    <circle cx="14.6" cy="10" r=".95" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconBang = (p) => (
  <Icon {...p}>
    <path d="M12 4.6v9.2" />
    <circle cx="12" cy="18.4" r="1.15" fill="currentColor" stroke="none" />
  </Icon>
);
