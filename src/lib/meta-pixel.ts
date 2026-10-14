import { CONSENT_KEY, createPixelController, parseConsent, validPixelId, type Consent } from "./tracking";

// Next.js inlines NEXT_PUBLIC_* during build. Missing/invalid ID means no UI or network activity.
export const PIXEL_ENABLED = validPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID);
type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push?: Fbq;
  loaded: boolean;
  version: string;
};
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }
let memoryConsent: Consent = null;
let hasMemoryChoice = false;
const controller = createPixelController(PIXEL_ENABLED, loadPixel, (...args) => window.fbq?.(...args));
const listeners = new Set<() => void>();
export function subscribeConsent(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getConsent(): Consent {
  if (hasMemoryChoice) return memoryConsent;
  try { return parseConsent(localStorage.getItem(CONSENT_KEY)); } catch { return memoryConsent; }
}
export function serverConsent(): Consent { return null; }
function clearMarketingCookies() {
  // Remove only Meta's first-party cookies, including parent-domain variants. Never touch LINA credentials.
  const host = location.hostname.split(".");
  const domains = ["", ...host.map((_, i) => `; Domain=${host.slice(i).join(".")}`)];
  for (const name of ["_fbp", "_fbc"]) for (const domain of domains) {
    document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax; Secure`;
  }
}
function revoke(reloadAllowed = true) {
  if (window.fbq) {
    // Discard any unsent commands before the vendor library finishes loading.
    window.fbq.queue.length = 0;
    window.fbq("consent", "revoke");
  }
  clearMarketingCookies();
  // Unload third-party code entirely; a script tag removal alone cannot do this.
  // If storage is read-only, reloading could restore an older grant. Keep the current
  // document revoked instead; never trade an explicit refusal for a stale stored choice.
  if (controller.isLoaded() && reloadAllowed) location.reload();
}
export function setConsent(value: Exclude<Consent, null>) {
  memoryConsent = value;
  hasMemoryChoice = true;
  let persisted = false;
  try { localStorage.setItem(CONSENT_KEY, value); persisted = true; } catch { /* Current document only when storage is blocked. */ }
  if (value === "denied") revoke(persisted);
  listeners.forEach(listener => listener());
}
export function syncConsent(event: StorageEvent) {
  if (event.key !== CONSENT_KEY && event.key !== null) return;
  hasMemoryChoice = false;
  memoryConsent = getConsent();
  if (memoryConsent !== "granted") revoke();
  listeners.forEach(listener => listener());
}
function loadPixel() {
    // Official Meta base-code queue, created only after explicit marketing consent.
    const fbq: Fbq = Object.assign((...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue.push(args);
    }, { queue: [] as unknown[][], loaded: true, version: "2.0" });
    fbq.push = fbq;
    window.fbq = fbq; window._fbq = fbq;
    fbq("consent", "grant");
    fbq("set", "autoConfig", false, process.env.NEXT_PUBLIC_META_PIXEL_ID);
    fbq("init", process.env.NEXT_PUBLIC_META_PIXEL_ID);
    const script = document.createElement("script");
    script.async = true; script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.id = "lina-meta-pixel";
    document.head.appendChild(script);
}
export function activatePixel(path: string) {
  controller.activate(path, getConsent());
}
export function deactivatePixel(path: string) {
  controller.deactivate(location.pathname === path ? path : location.pathname);
}
export function trackConversion(value: unknown) {
  // No backlog: later consent never sends historical conversions.
  try { controller.conversion(value, location.pathname, getConsent()); } catch { /* Analytics must never block chat. */ }
}
