"use client";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/preferences";
import { MarketingConsentControls } from "./marketing-consent-controls";
import { trackablePath } from "@/lib/tracking";
import { activatePixel, deactivatePixel, getConsent, PIXEL_ENABLED, serverConsent, setConsent, subscribeConsent, syncConsent } from "@/lib/meta-pixel";

export function MarketingConsent({ locale }: { locale: Locale }) {
  const path = usePathname();
  const consent = useSyncExternalStore(subscribeConsent, getConsent, serverConsent);
  useEffect(() => {
    if (!PIXEL_ENABLED) return;
    window.addEventListener("storage", syncConsent);
    if (trackablePath(path)) activatePixel(path); else deactivatePixel(path);
    return () => { window.removeEventListener("storage", syncConsent); deactivatePixel(path); };
  }, [path, consent]);
  if (!PIXEL_ENABLED || !trackablePath(path)) return null;
  return <MarketingConsentControls locale={locale} consent={consent} onChange={setConsent}/>;
}
