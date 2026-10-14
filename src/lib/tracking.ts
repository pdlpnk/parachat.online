import type { Locale } from "./preferences";

export type Conversion = {
  event: "Lead" | "Contact";
  eventId: string;
  locale: Lowercase<Locale>;
};
export const CONSENT_KEY = "lina-marketing-consent-v1";
export type Consent = "granted" | "denied" | null;
export function parseConsent(value: string | null): Consent {
  return value === "granted" || value === "denied" ? value : null;
}
export function validPixelId(value: string | undefined): boolean {
  return typeof value === "string" && /^[0-9]{5,30}$/.test(value);
}
// Explicit allowlist. Never broaden this to a global layout without reviewing admin/dev paths.
export function trackablePath(path: string): boolean { return path === "/"; }
export function validConversion(value: unknown): value is Conversion {
  if (!value || typeof value !== "object") return false;
  const v = value as Conversion;
  return (v.event === "Lead" || v.event === "Contact") &&
    typeof v.eventId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.eventId) &&
    ["en", "ru", "tr", "az", "fa"].includes(v.locale);
}

/** A document-scoped guard, not a delivery guarantee. The server owns conversion eligibility. */
export function createTrackingGate(send: (...args: unknown[]) => void) {
  let lastPath: string | null = null;
  const seen = new Set<string>();
  return {
    page(path: string, consent: Consent) {
      if (!trackablePath(path)) { lastPath = null; return; }
      if (consent !== "granted" || lastPath === path) return;
      lastPath = path;
      send("track", "PageView");
    },
    conversion(value: unknown, path: string, consent: Consent) {
      if (consent !== "granted" || !trackablePath(path) || !validConversion(value) || seen.has(value.eventId)) return;
      seen.add(value.eventId);
      send("track", value.event, { content_name: "LINA Chat", content_category: "Chat", locale: value.locale }, { eventID: value.eventId });
    },
  };
}

/** Separates consent/routing decisions from the vendor loader, so tests never contact Meta. */
export function createPixelController(enabled: boolean, load: () => void, send: (...args: unknown[]) => void) {
  let loaded = false;
  const gate = createTrackingGate(send);
  return {
    isLoaded: () => loaded,
    activate(path: string, consent: Consent) {
      if (!enabled || !trackablePath(path) || consent !== "granted") return;
      if (!loaded) { load(); loaded = true; }
      send("consent", "grant");
      gate.page(path, consent);
    },
    deactivate(path: string) {
      gate.page(path, null);
      if (loaded) send("consent", "revoke");
    },
    conversion(value: unknown, path: string, consent: Consent) {
      if (enabled && loaded) gate.conversion(value, path, consent);
    },
  };
}
