"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandMark } from "./brand-mark";
import { AttachmentIcon, MessageBubble, SendIcon } from "./messenger";
import { localMessageTime, mergeMessages, normalizeMessage, type MessageDTO } from "@/lib/messages";
import { createPoller, type MessageBatch } from "@/lib/polling";
const subscribe = () => () => {};
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(url: string, options: RequestInit): Promise<T> {
  const signal = AbortSignal.any([AbortSignal.timeout(10000), ...(options.signal ? [options.signal] : [])]);
  const result = await fetch(url, { ...options, signal, cache: "no-store", credentials: "same-origin" });
  if (!result.ok) {
    const body = await result.json().catch(() => ({}));
    throw new RequestError(result.status, typeof body.error === "string" ? body.error : "Не удалось выполнить запрос.");
  }
  return result.json() as Promise<T>;
}
type Attempt = { key: string; text: string };
export function PlayerMessenger({ liId, initialMessages }: { liId: string; initialMessages: MessageDTO[] }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState(""); const draftRef = useRef("");
  const [failedAttempt, setFailedAttempt] = useState<Attempt | null>(null);
  const [sending, setSending] = useState(false), [error, setError] = useState("");
  const [offline, setOffline] = useState(false), [expired, setExpired] = useState(false);
  const [newMessages, setNewMessages] = useState(false), [unread, setUnread] = useState(0);
  const history = useRef<HTMLElement>(null), textarea = useRef<HTMLTextAreaElement>(null);
  const historySize = useRef({ height: 0, content: 0 });
  const nearBottom = useRef(true), firstScroll = useRef(true), forceBottom = useRef(false);
  const cursor = useRef(initialMessages.at(-1)?.sequence ?? 0), readSequence = useRef(0);
  const attempt = useRef<Attempt | null>(null), inFlight = useRef(false), alive = useRef(false), restoreFocus = useRef(false);
  const sendController = useRef<AbortController | null>(null), readController = useRef<AbortController | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sessionFailure = useCallback((e: unknown) => {
    if (e instanceof RequestError && e.status === 401) { setExpired(true); return true; }
    return false;
  }, []);
  const scheduleRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(async () => {
      if (!alive.current || document.hidden || !nearBottom.current || readController.current || cursor.current <= readSequence.current) return;
      const sequence = cursor.current; const controller = new AbortController(); readController.current = controller;
      try {
        const result = await request<{ readSequence: number }>("/api/player/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequence }), signal: controller.signal });
        if (alive.current && !controller.signal.aborted) { readSequence.current = Math.max(readSequence.current, result.readSequence); if (cursor.current <= result.readSequence) setUnread(0); }
      } catch (e) { if (alive.current && !controller.signal.aborted) sessionFailure(e); }
      finally { readController.current = null; }
    }, 300);
  }, [sessionFailure]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(readTimer.current); sendController.current?.abort(); readController.current?.abort(); };
  }, []);
  useEffect(() => {
    if (expired) return;
    const poller = createPoller(cursor.current,
      (after, signal) => request<MessageBatch>(`/api/player/messages?after=${after}`, { signal }),
      (batch, next) => {
        cursor.current = next; readSequence.current = Math.max(readSequence.current, batch.readSequence);
        setUnread(batch.unreadCount); setOffline(false); setMessages(current => mergeMessages(current, batch.messages)); scheduleRead();
      }, e => { if (!sessionFailure(e)) setOffline(true); });
    const visibility = () => {
      if (document.hidden) { poller.pause(); clearTimeout(readTimer.current); readController.current?.abort(); }
      else { poller.resume(); scheduleRead(); }
    };
    visibility(); document.addEventListener("visibilitychange", visibility); window.addEventListener("online", visibility);
    return () => { poller.pause(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", visibility); };
  }, [expired, scheduleRead, sessionFailure]);
  useLayoutEffect(() => {
    if (!hydrated || !history.current) return;
    const el = history.current;
    if (firstScroll.current || forceBottom.current || nearBottom.current) {
      el.scrollTop = el.scrollHeight; nearBottom.current = true; setNewMessages(false);
    } else { setNewMessages(true); }
    firstScroll.current = false; forceBottom.current = false; scheduleRead();
  }, [messages, hydrated, scheduleRead]);
  useEffect(() => {
    const el = history.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) { el.scrollTop = el.scrollHeight; scheduleRead(); }
      historySize.current = { height: el.clientHeight, content: el.scrollHeight };
    });
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [scheduleRead]);
  useLayoutEffect(() => {
    const el = textarea.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 136)}px`;
    if (nearBottom.current && history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [draft]);
  useLayoutEffect(() => {
    if (!sending && restoreFocus.current) { restoreFocus.current = false; textarea.current?.focus(); }
  }, [sending]);
  async function send(retry = false) {
    if (inFlight.current || expired) return;
    const text = retry ? attempt.current?.text : normalizeMessage(draftRef.current);
    if (!text) { setError("Введите сообщение от 1 до 5000 символов."); return; }
    const logical = attempt.current?.text === text ? attempt.current : { key: crypto.randomUUID(), text };
    attempt.current = logical; restoreFocus.current = true; inFlight.current = true; setSending(true); setError(""); setFailedAttempt(null);
    const controller = new AbortController(); sendController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await request<{ message: MessageDTO }>("/api/player/messages", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": logical.key }, body: JSON.stringify({ text: logical.text }), signal: controller.signal });
      if (!alive.current) return;
      forceBottom.current = true; setMessages(current => mergeMessages(current, [result.message]));
      // A poll can already have delivered the same message, so also scroll explicitly on confirmation.
      if (history.current) history.current.scrollTop = history.current.scrollHeight;
      nearBottom.current = true; setNewMessages(false);
      if (normalizeMessage(draftRef.current) === logical.text) { draftRef.current = ""; setDraft(""); }
      attempt.current = null; scheduleRead();
    } catch (e) {
      if (!alive.current) return;
      if (!sessionFailure(e)) { setFailedAttempt(logical); setError(e instanceof RequestError ? e.message : "Не удалось подтвердить отправку. Повторите попытку — сообщение не продублируется."); }
    } finally { clearTimeout(timeout); inFlight.current = false; if (alive.current) { setSending(false); } }
  }
  return <main className="messenger-shell" aria-label="Ваш чат"><div className="messenger">
    <header className="chat-header"><BrandMark /><div className="chat-heading"><h1>LINA</h1><p>Персональный менеджер</p></div><div className="client-reference"><span>Ваш ID</span><p>{liId}</p></div></header>
    {expired ? <aside className="chat-status" role="alert">Сессия завершена. <button onClick={() => location.reload()}>Обновить страницу</button></aside> : offline && <aside className="chat-status" role="status">Не удаётся обновить чат. Повторяем подключение…</aside>}
    <section ref={history} className="messages" aria-label="Сообщения" tabIndex={0} onScroll={() => {
      const el = history.current!;
      const resized = historySize.current.height !== el.clientHeight || historySize.current.content !== el.scrollHeight;
      // Layout-generated scroll events must not turn an anchored reader into a history reader.
      if (resized && nearBottom.current) el.scrollTop = el.scrollHeight;
      else nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
      historySize.current = { height: el.clientHeight, content: el.scrollHeight };
      if (nearBottom.current) { setNewMessages(false); scheduleRead(); }
    }}><div className="history-content"><ol className="message-list">{messages.map(message => <MessageBubble key={message.sequence} message={{ id: String(message.sequence), kind: message.authorType, text: message.text, time: hydrated ? localMessageTime(message.createdAt) : undefined }} />)}</ol></div></section>
    {newMessages && <button className="new-messages" onClick={() => { if (history.current) history.current.scrollTop = history.current.scrollHeight; nearBottom.current = true; setNewMessages(false); scheduleRead(); }}>Новые сообщения{unread > 0 ? ` · ${unread}` : ""} ↓</button>}
    <footer className="composer" aria-label="Написать сообщение" aria-busy={sending}><form onSubmit={e => { e.preventDefault(); void send(); }}>
      <div className={`composer-field${error ? " composer-error" : ""}`}>
        <button className="icon-button attachment-button" type="button" disabled aria-label="Прикрепить файл — пока недоступно"><AttachmentIcon /></button>
        <label className="sr-only" htmlFor="message-draft">Ваше сообщение</label>
        <textarea ref={textarea} id="message-draft" rows={1} placeholder="Напишите сообщение…" value={draft} disabled={sending || expired} aria-describedby="composer-note" onChange={e => { draftRef.current = e.target.value; setDraft(e.target.value); }} onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send(); }
        }} />
        <button className="icon-button send-button" type="submit" disabled={sending || expired || !normalizeMessage(draft)} aria-label="Отправить сообщение"><SendIcon /></button>
      </div>
      <p id="composer-note" className="composer-note" role={error ? "alert" : "status"}>{sending ? "Отправляем…" : error || "Enter — отправить · Shift+Enter — новая строка"}</p>
      {error && failedAttempt && normalizeMessage(draft) !== failedAttempt.text && <p className="failed-preview">Не подтверждено: {failedAttempt.text.slice(0, 120)}{failedAttempt.text.length > 120 ? "…" : ""}</p>}
      {error && failedAttempt && !expired && <button className="retry-send" type="button" disabled={sending} onClick={() => void send(true)}>Повторить отправку</button>}
    </form></footer>
  </div></main>;
}
