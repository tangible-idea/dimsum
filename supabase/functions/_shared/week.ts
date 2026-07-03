// 주간 랭킹 주기 계산 — KST(UTC+9) 월요일 00:00 ~ 다음 월요일 00:00
const KST_MS = 9 * 3600 * 1000;

// 해당 시각이 속한 주의 시작(KST 월요일)을 'YYYY-MM-DD'로
export function weekStartKst(d: Date = new Date()): string {
  const k = new Date(d.getTime() + KST_MS);
  const dow = (k.getUTCDay() + 6) % 7; // 월=0 ... 일=6
  const mon = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow));
  return mon.toISOString().slice(0, 10);
}

// week_start('YYYY-MM-DD', KST 날짜) → 주 마감 시각(UTC ISO)
export function weekEndUtc(weekStart: string): string {
  const monKstMidnightUtc = Date.parse(weekStart + "T00:00:00Z") - KST_MS;
  return new Date(monKstMidnightUtc + 7 * 86400000).toISOString();
}

// 직전 주(정산 대상)의 week_start
export function prevWeekStart(weekStart: string): string {
  const t = Date.parse(weekStart + "T00:00:00Z") - 7 * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP",
];
