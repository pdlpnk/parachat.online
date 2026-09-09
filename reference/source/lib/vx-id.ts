export const VX_ID_PATTERN = /^VX\d{6}$/;

export function normalizeVxIdSearch(value: string): string | null {
  const compact = value.trim().replace(/^vx/i, "");
  if (!/^\d{1,6}$/.test(compact)) return null;
  return `VX${compact.padStart(6, "0")}`;
}

export function isVxId(value: string): boolean {
  return VX_ID_PATTERN.test(value);
}
