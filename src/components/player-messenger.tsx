"use client";
import {PlayerSettings} from "./player-settings";
import {DEFAULT_PREFERENCES,type Preferences} from "@/lib/preferences";
import {WORDS,playerError} from "@/lib/player-i18n";
import {systemText} from "@/lib/player";
import { ATTACHMENT_ACCEPT, ATTACHMENT_LIMIT } from '@/lib/attachments';
import { AttachmentPreview } from '@/components/attachment-preview';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandMark } from "./brand-mark";
import { AttachmentIcon, MessageBubble, SendIcon } from "./messenger";
import { localMessageTime, mergeMessages, normalizeMessage, type MessageDTO } from "@/lib/messages";
import { createPoller, type MessageBatch } from "@/lib/polling";
const subscribe = () => () => {};
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(url: string, options: RequestInit): Promise<T> {
  const signal = AbortSignal.any([AbortSignal.timeout(options.body instanceof FormData ? 60000 : 10000), ...(options.signal ? [options.signal] : [])]);
  const result = await fetch(url, { ...options, signal, cache: "no-store", credentials: "same-origin" });
  if (!result.ok) {
    const body = await result.json().catch(() => ({}));
    throw new RequestError(result.status, typeof body.error === "string" ? body.error : "Не удалось выполнить запрос.");
  }
  return result.json() as Promise<T>;
}
type Attempt = { key: string; text: string; file?: File };
export function PlayerMessenger({ liId, initialMessages, initialPreferences=DEFAULT_PREFERENCES }: { liId: string; initialMessages: MessageDTO[]; initialPreferences?:Preferences }) {
  const [preferences,setPreferences]=useState(initialPreferences);const t=WORDS[preferences.locale];
  const root=useRef<HTMLElement>(null);
  useEffect(()=>{
    const viewport=window.visualViewport;if(!viewport)return;
    const resize=()=>{if(viewport.scale===1)root.current?.style.setProperty("--player-height",`${viewport.height}px`);};
    resize();viewport.addEventListener("resize",resize);
    return()=>viewport.removeEventListener("resize",resize);
  },[]);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [messages, setMessages] = useState(initialMessages);
  const [file,setFile] = useState<File|undefined>(); const picker=useRef<HTMLInputElement>(null);
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
    const selectedFile=retry?attempt.current?.file:file;
    const text = retry ? attempt.current?.text : selectedFile&&!draftRef.current.trim()?"":normalizeMessage(draftRef.current);
    if (text===null||text===undefined||(!text&&!selectedFile)) { setError("length"); return; }
    const logical = attempt.current?.text === text && attempt.current.file===selectedFile ? attempt.current : { key: crypto.randomUUID(), text, file:selectedFile };
    attempt.current = logical; restoreFocus.current = true; inFlight.current = true; setSending(true); setError(""); setFailedAttempt(null);
    const controller = new AbortController(); sendController.current = controller;
    const timeout = setTimeout(() => controller.abort(), logical.file?60000:15000);
    try {
      let body:BodyInit;let headers:Record<string,string>={'Idempotency-Key':logical.key};
      if(logical.file){const form=new FormData();form.set('text',logical.text);form.set('file',logical.file);body=form;}else{headers={...headers,'Content-Type':'application/json'};body=JSON.stringify({text:logical.text});}
      const result = await request<{ message: MessageDTO }>(`/api/player/${logical.file?"attachments":"messages"}`, {method:'POST',headers,body,signal:controller.signal});
      if (!alive.current) return;
      forceBottom.current = true; setMessages(current => mergeMessages(current, [result.message]));
      // A poll can already have delivered the same message, so also scroll explicitly on confirmation.
      if (history.current) history.current.scrollTop = history.current.scrollHeight;
      nearBottom.current = true; setNewMessages(false);
      if ((normalizeMessage(draftRef.current)??"") === logical.text) { draftRef.current = ""; setDraft(""); }
      if(file===logical.file)setFile(undefined);
      attempt.current = null; scheduleRead();
    } catch (e) {
      if (!alive.current) return;
      if (!sessionFailure(e)) { setFailedAttempt(logical); setError(e instanceof RequestError ? String(e.status) : "uncertain"); }
    } finally { clearTimeout(timeout); inFlight.current = false; if (alive.current) { setSending(false); } }
  }
  return <main ref={root} className="messenger-shell player-root" data-theme={preferences.theme} data-font={preferences.font} lang={preferences.locale.toLowerCase()} dir={preferences.locale==="FA"?"rtl":"ltr"} aria-label={t.chat}><div className="messenger">
    <header className="chat-header"><BrandMark /><div className="chat-heading"><h1>LINA</h1><p>{t.manager}</p></div><div className="client-reference"><span>{t.id}</span><p dir="ltr">{liId}</p></div><PlayerSettings value={preferences} onChange={setPreferences}/></header>
    {expired ? <aside className="chat-status" role="alert">{t.expired} <button onClick={() => location.reload()}>{t.reload}</button></aside> : offline && <aside className="chat-status" role="status">{t.offline}</aside>}
    <section ref={history} className="messages" aria-label={t.messages} tabIndex={0} onScroll={() => {
      const el = history.current!;
      const resized = historySize.current.height !== el.clientHeight || historySize.current.content !== el.scrollHeight;
      // Layout-generated scroll events must not turn an anchored reader into a history reader.
      if (resized && nearBottom.current) el.scrollTop = el.scrollHeight;
      else nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
      historySize.current = { height: el.clientHeight, content: el.scrollHeight };
      if (nearBottom.current) { setNewMessages(false); scheduleRead(); }
    }}><div className="history-content"><ol className="message-list">{messages.map(message => <MessageBubble key={message.sequence} locale={preferences.locale} message={{ id: String(message.sequence), kind: message.authorType, text: message.authorType==="SYSTEM"?systemText(message.system?.key??null,message.system?.params,preferences.locale):message.text, attachments:message.attachments, time: hydrated ? localMessageTime(message.createdAt) : undefined }} />)}</ol></div></section>
    {newMessages && <button className="new-messages" onClick={() => { if (history.current) history.current.scrollTop = history.current.scrollHeight; nearBottom.current = true; setNewMessages(false); scheduleRead(); }}>{t.newMessages}{unread > 0 ? ` · ${unread}` : ""} ↓</button>}
    <footer className="composer" aria-label={t.compose} aria-busy={sending}><form onSubmit={e => { e.preventDefault(); void send(); }}>
      {file&&<AttachmentPreview locale={preferences.locale} file={file} onRemove={()=>setFile(undefined)} disabled={sending}/> }
      <div className={`composer-field${error ? " composer-error" : ""}`}>
        <input ref={picker} type="file" hidden accept={ATTACHMENT_ACCEPT} aria-label={t.choose} onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected){if(selected.size>ATTACHMENT_LIMIT){setError('size');return;}setFile(selected);setError('');}}}/>
        <button className="icon-button attachment-button" type="button" disabled={sending||expired} onClick={()=>picker.current?.click()} aria-label={t.attach}><AttachmentIcon /></button>
        <label className="sr-only" htmlFor="message-draft">{t.message}</label>
        <textarea ref={textarea} id="message-draft" rows={1} dir="auto" placeholder={t.placeholder} value={draft} disabled={sending || expired} aria-describedby="composer-note" onChange={e => { draftRef.current = e.target.value; setDraft(e.target.value); }} onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send(); }
        }} />
        <button className="icon-button send-button" type="submit" disabled={sending || expired || (!normalizeMessage(draft)&&!file)} aria-label={t.send}><SendIcon /></button>
      </div>
      <p id="composer-note" className="composer-note" role={error ? "alert" : "status"}>{sending ? t.sending : error ? (error==="length"?t.length:error==="size"?t.size:error==="uncertain"?t.uncertain:playerError(Number(error),preferences.locale)) : t.hint}</p>
      {error && failedAttempt && normalizeMessage(draft) !== failedAttempt.text && <p className="failed-preview">{t.unconfirmed} {failedAttempt.text.slice(0, 120)}{failedAttempt.text.length > 120 ? "…" : ""}</p>}
      {error && failedAttempt && !expired && <button className="retry-send" type="button" disabled={sending} onClick={() => void send(true)}>{t.retry}</button>}
    </form></footer>
  </div></main>;
}
