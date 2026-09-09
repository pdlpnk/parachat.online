import { fromDatabaseLanguage, type Locale } from "./config";
import type { MessageKey } from "./messages";
import { translate, type TranslationValues } from "./translate";

export type SystemMessageKey = Extract<MessageKey, `system.${string}`>;

export type SystemMessageEnvelope = {
  readonly vxSystemMessage: 1;
  readonly key: SystemMessageKey;
  readonly params: TranslationValues;
  readonly createdLocale: Locale;
};

export function encodeSystemMessage(key: SystemMessageKey, params: TranslationValues, locale: Locale) {
  return JSON.stringify({ vxSystemMessage: 1, key, params, createdLocale: locale } satisfies SystemMessageEnvelope);
}

export function decodeSystemMessage(value: string): SystemMessageEnvelope | null {
  try {
    const parsed = JSON.parse(value) as Partial<SystemMessageEnvelope>;
    if (parsed.vxSystemMessage !== 1 || typeof parsed.key !== "string" || !parsed.key.startsWith("system.")) return null;
    return {
      vxSystemMessage: 1,
      key: parsed.key as SystemMessageKey,
      params: parsed.params && typeof parsed.params === "object" && !Array.isArray(parsed.params) ? parsed.params : {},
      createdLocale: typeof parsed.createdLocale === "string" ? parsed.createdLocale as Locale : "en",
    };
  } catch {
    return null;
  }
}

export function renderSystemMessage(locale: Locale, key: SystemMessageKey, params: TranslationValues = {}) {
  return translate(locale, key === "system.onboardingPlayer" ? "system.managerReady" : key, params);
}

export function systemNotificationParts(locale: Locale, key: SystemMessageKey, params: TranslationValues = {}) {
  const [title, ...body] = renderSystemMessage(locale, key, params).split("\n\n");
  return { title, body: body.join("\n\n") || title };
}

export function databaseLocale(value: "EN" | "RU" | "TR" | "AZ") {
  return fromDatabaseLanguage(value);
}
