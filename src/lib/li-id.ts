export const LI_ID_MAX = 999_999;
const LI_ID_PATTERN = /^LI[0-9]{6}$/;

/** Public display/search identifier only. Never use as an authentication secret. */
export function formatLiId(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > LI_ID_MAX) {
    throw new RangeError("LI ID number must be an integer between 1 and 999999");
  }
  return `LI${String(value).padStart(6, "0")}`;
}

export function isLiId(value: string): boolean {
  return LI_ID_PATTERN.test(value) && value !== "LI000000";
}

export function normalizeLiIdSearch(value: string): string | null {
  const digits = value.trim().replace(/^li/i, "");
  if (!/^[0-9]{1,6}$/.test(digits)) return null;
  const number = Number(digits);
  return number > 0 ? formatLiId(number) : null;
}
