import {WORDS} from "./player-i18n";
import type {Locale} from "./preferences";
export function validateDisplayName(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 320) return null;
  const name = input.trim().normalize("NFC");
  // Reject controls, lone surrogates and bidi/zero-width formatting; allow Unicode letters and emoji.
  if (!name || [...name].length > 80 || /[\p{Cc}\p{Cs}\p{Cf}]/u.test(name) || !/[^\p{Z}\p{M}]/u.test(name)) return null;
  return name;
}
export function systemText(key: string | null, params: unknown, locale:Locale="RU"): string {
  if (key === "system.welcome" && params && typeof params === "object" && "name" in params) {
    const name = validateDisplayName(params.name);
    if (name) return WORDS[locale].welcome.replace("{name}",()=>name);
  }
  return WORDS[locale].system;
}
