"use client";

import {LanguagePicker} from "./player-settings";
import {WORDS,playerError} from "@/lib/player-i18n";
import {browserLocale,type Locale} from "@/lib/preferences";
import { BrandMark } from "./brand-mark";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";

async function bootstrap() {
  const result = await fetch("/api/player/bootstrap", { method: "POST" });
  if (!result.ok) throw new Error("Не удалось подготовить чат. Попробуйте ещё раз.");
  return result.json() as Promise<{ authenticated: boolean }>;
}
const subscribeLanguage=()=>()=>{};
export function NameForm({unavailable=false}:{unavailable?:boolean}) {
  const detected=useSyncExternalStore(subscribeLanguage,()=>browserLocale(navigator.language),()=>"EN" as Locale);
  const [chosen,setLocale]=useState<Locale|null>(null);const locale=chosen??detected,t=WORDS[locale];
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // The same origin-wide lock also covers Start, preventing competing first-cookie installations across tabs.
    if (navigator.locks) void navigator.locks.request("lina-player-start", async () => {
      const state = await bootstrap();
      if (state.authenticated) window.location.replace("/");
    }).catch(() => {});
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy||unavailable) return;
    setBusy(true); setError("");
    try {
      if (!navigator.locks) throw new Error("secure");
      await navigator.locks.request("lina-player-start", async () => {
        const state = await bootstrap();
        if (!state.authenticated) {
          const result = await fetch("/api/player/start", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name, locale }),
          });
          if (!result.ok) {
            throw new Error(String(result.status));
          }
        }
        window.location.replace("/");
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "503"); }
    finally { setBusy(false); }
  }
  return <main className="landing player-root" data-theme="light" data-font="modern" lang={locale.toLowerCase()} dir={locale==="FA"?"rtl":"ltr"}><section className="name-card" aria-labelledby="brand">
    <div className="landing-brand"><BrandMark /><h1 id="brand">LINA</h1></div>
    <h2>{t.title}</h2>
    <p className="landing-description">{t.subtitle}</p>
    {unavailable&&<p className="error" role="alert">{t.generic}</p>}
    <form onSubmit={submit}>
      <label htmlFor="displayName">{t.name}</label>
      <input id="displayName" name="displayName" autoComplete="given-name" placeholder={t.namePlaceholder} value={name}
        onChange={(event) => setName(event.target.value)} required maxLength={160} disabled={busy}
        aria-describedby={error ? "start-error" : undefined} />
      {error && <p className="error" id="start-error" role="alert">{error==="secure"?t.secure:playerError(Number(error),locale)}</p>}
      <LanguagePicker value={locale} onChange={setLocale} disabled={busy}/>
      <button disabled={busy||unavailable} type="submit">{busy ? t.opening : t.start}</button>
    </form>
    <p className="landing-note">{t.note}</p>
    <noscript>{t.javascript}</noscript>
  </section></main>;
}
