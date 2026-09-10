import { BrandMark } from "./brand-mark";

export type MessageView = {
  id: string;
  kind: "SYSTEM" | "OPERATOR" | "USER";
  text: string;
  /** Only pass a label when backed by real data, or explicitly labeled design fixtures. */
  time?: string;
};

export function AttachmentIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}
export function SendIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14" /></svg>;
}

export function MessageBubble({ message, perspective = "player" }: { message: MessageView; perspective?: "player" | "admin" }) {
  return <li className={`message-row message-${message.kind.toLowerCase()}${perspective === "admin" ? " admin-bubble" : ""}`}>
    {message.kind !== "USER" && <BrandMark small />}
    <article className="message-bubble" aria-label={message.kind === "USER" ? (perspective === "admin" ? "Клиент" : "Вы") : message.kind === "OPERATOR" ? "Менеджер" : "Сообщение LINA"}>
      {message.kind === "SYSTEM" && <p className="bubble-eyebrow">LINA</p>}
      <p className="message-text">{message.text}</p>
      {message.time && <span className="message-time">{message.time}</span>}
    </article>
  </li>;
}

/** Presentation only. No form, event handlers, mutation, upload or fake send. */
export function Composer({ state = "disabled", error }: { state?: "disabled" | "loading" | "error"; error?: string }) {
  return <footer className="composer" aria-label="Написать сообщение" aria-busy={state === "loading"}>
    <div className={`composer-field${state === "error" ? " composer-error" : ""}`}>
      <button className="icon-button attachment-button" type="button" disabled aria-label="Прикрепить файл — пока недоступно"><AttachmentIcon /></button>
      <label className="sr-only" htmlFor="message-draft">Ваше сообщение — отправка пока недоступна</label>
      <textarea id="message-draft" rows={1} placeholder="Напишите сообщение…" disabled aria-describedby="composer-note" />
      <button className="icon-button send-button" type="button" disabled aria-label="Отправить сообщение — пока недоступно"><SendIcon /></button>
    </div>
    <p id="composer-note" className="composer-note" role={state === "error" ? "alert" : undefined}>
      {state === "error" ? (error || "Не удалось отправить сообщение.") : state === "loading" ? "Отправляем…" : "Отправка сообщений пока недоступна"}
    </p>
  </footer>;
}

export function Messenger({ liId, messages, preview = false }: { liId: string; messages: MessageView[]; preview?: boolean }) {
  return <main className="messenger-shell" aria-label="Ваш чат">
    <div className="messenger">
      <header className="chat-header">
        <BrandMark />
        <div className="chat-heading"><h1>LINA</h1><p>Персональный менеджер</p></div>
        <div className="client-reference"><span>{preview ? "Пример ID" : "Ваш ID"}</span><p>{liId}</p></div>
      </header>
      {preview && <aside className="preview-notice" aria-label="Дизайн-превью">Дизайн-превью · сообщения и время — примеры, они не сохраняются</aside>}
      <section className="messages" aria-label="Сообщения" tabIndex={0}>
        <div className="history-content">
          <div className="conversation-intro"><span className="intro-line" /><span>{preview ? "Сегодня · пример" : "Начало вашего чата"}</span><span className="intro-line" /></div>
          <ol className="message-list">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}</ol>
        </div>
      </section>
      <Composer />
    </div>
  </main>;
}
