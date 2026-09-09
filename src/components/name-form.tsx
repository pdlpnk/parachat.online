"use client";

import { BrandMark } from "./brand-mark";
import { useEffect, useState, type FormEvent } from "react";

async function bootstrap() {
  const result = await fetch("/api/player/bootstrap", { method: "POST" });
  if (!result.ok) throw new Error("Не удалось подготовить чат. Попробуйте ещё раз.");
  return result.json() as Promise<{ authenticated: boolean }>;
}
export function NameForm() {
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
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!navigator.locks) throw new Error("Для начала чата откройте LINA в современном браузере по защищённому адресу.");
      await navigator.locks.request("lina-player-start", async () => {
        const state = await bootstrap();
        if (!state.authenticated) {
          const result = await fetch("/api/player/start", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name }),
          });
          if (!result.ok) {
            const body = await result.json();
            throw new Error(body.error || "Не удалось открыть чат. Попробуйте ещё раз.");
          }
        }
        window.location.replace("/");
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось открыть чат. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <main className="landing"><section className="name-card" aria-labelledby="brand">
    <div className="landing-brand"><BrandMark /><h1 id="brand">LINA</h1></div>
    <h2>Ваш личный чат<br />с менеджером</h2>
    <p className="landing-description">Один разговор. Всё внимание — вам.</p>
    <form onSubmit={submit}>
      <label htmlFor="displayName">Ваше имя</label>
      <input id="displayName" name="displayName" autoComplete="given-name" placeholder="Как к вам обращаться?" value={name}
        onChange={(event) => setName(event.target.value)} required maxLength={160} disabled={busy}
        aria-describedby={error ? "start-error" : undefined} />
      {error && <p className="error" id="start-error" role="alert">{error}</p>}
      <button disabled={busy} type="submit">{busy ? "Открываем…" : "Начать"}</button>
    </form>
    <p className="landing-note">Представьтесь, чтобы начать разговор.</p>
    <noscript>Для начала чата включите JavaScript.</noscript>
  </section></main>;
}
