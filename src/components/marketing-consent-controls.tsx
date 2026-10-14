"use client";
import { useState } from "react";
import type { Locale } from "@/lib/preferences";
import type { Consent } from "@/lib/tracking";
import { CONSENT_WORDS } from "@/lib/consent-i18n";

export function MarketingConsentControls({ locale, consent, onChange }: {
  locale: Locale; consent: Consent; onChange: (value: Exclude<Consent, null>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = CONSENT_WORDS[locale];
  return <aside className="marketing-consent" aria-label={t.title}>
    <button type="button" className="privacy-toggle" aria-expanded={expanded || consent === null} onClick={() => setExpanded(!expanded)}>{t.settings}</button>
    {(expanded || consent === null) && <div className="privacy-panel">
      <p>{t.text}</p>
      {consent && <p role="status">{consent === "granted" ? t.enabled : t.disabled}</p>}
      <div className="privacy-actions">
        {consent !== "granted" && <button type="button" onClick={() => { onChange("granted"); setExpanded(false); }}>{t.allow}</button>}
        <button type="button" onClick={() => { onChange("denied"); setExpanded(false); }}>{consent === "granted" ? t.revoke : t.deny}</button>
      </div>
    </div>}
  </aside>;
}
