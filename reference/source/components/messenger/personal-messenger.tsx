"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Expand, FileText, ImageIcon, LoaderCircle, MessageCircle, Paperclip, Send, Smile, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/i18n-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatLocalDay, formatLocalTime, type Locale } from "@/lib/i18n";
import type { SupportConversationView, SupportMessageView } from "@/lib/support";
import styles from "./personal-messenger.module.css";

const transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };
const emojis = ["🙂", "👍", "❤️", "✨"];
const allowedAttachmentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxAttachmentSize = 10 * 1024 * 1024;

function fileSizeLabel(value: number, megabytes: string, kilobytes: string) {
  return value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(1)} ${megabytes}`
    : `${Math.max(1, Math.round(value / 1024))} ${kilobytes}`;
}

function messageAuthor(message: SupportMessageView) {
  if (message.authorType === "USER") return "user";
  if (message.authorType === "SYSTEM") return "system";
  return "manager";
}

function messagePreview(message: SupportMessageView | undefined, emptyLabel: string) {
  if (!message) return emptyLabel;
  return message.body.replace(/\s+/g, " ").trim();
}

function MessageList({
  conversation,
  pending,
  shouldReduceMotion,
  locale,
  todayLabel,
}: {
  conversation: SupportConversationView;
  pending: boolean;
  shouldReduceMotion: boolean;
  locale: Locale;
  todayLabel: string;
}) {
  const { t } = useI18n();
  const { profile } = useDashboard();
  const listRef = useRef<HTMLDivElement>(null);
  const restoredConversation = useRef("");
  const stickToBottom = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const key = `vx-house:messenger-scroll:${conversation.id}`;
    if (restoredConversation.current !== conversation.id) {
      restoredConversation.current = conversation.id;
      const saved = Number(window.sessionStorage.getItem(key));
      list.scrollTop = Number.isFinite(saved) && saved > 0 ? saved : list.scrollHeight;
      stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      return;
    }
    if (stickToBottom.current) {
      list.scrollTo({ top: list.scrollHeight, behavior: shouldReduceMotion ? "auto" : "smooth" });
    }
  }, [conversation.id, conversation.messages.length, pending, shouldReduceMotion]);

  return (
    <div
      ref={listRef}
      className={styles.messages}
      aria-live="polite"
      onScroll={(event) => {
        const list = event.currentTarget;
        stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        window.sessionStorage.setItem(`vx-house:messenger-scroll:${conversation.id}`, String(list.scrollTop));
      }}
    >
      <div className={styles.day}>
        {conversation.messages.at(-1)?.createdAt
          ? formatLocalDay(locale, conversation.messages.at(-1)!.createdAt, todayLabel)
          : todayLabel}
      </div>
      {conversation.messages.map((message) => {
        const author = messageAuthor(message);
        return (
          <motion.article
            key={message.id}
            className={styles.messageRow}
            data-author={author}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
          >
            {author === "user" ? (
              <UserAvatar className={styles.messageAvatar} name={profile?.user.displayName ?? profile?.user.email ?? "VX House"} avatarEmoji={profile?.user.avatarEmoji} ariaHidden />
            ) : (
              <span className={styles.messageAvatar} aria-hidden="true">{author === "system" ? "VX" : "M"}</span>
            )}
            <div className={styles.bubble}>
              <p>{message.systemKey ? t(message.systemKey, message.systemParams) : message.body}</p>
              {message.attachments.length ? (
                <div className={styles.attachments}>
                  {message.attachments.map((attachment) => {
                    const href = `/api/support/${conversation.id}/attachments/${attachment.id}`;
                    return attachment.mediaType.startsWith("image/") ? (
                      <a key={attachment.id} className={styles.imageAttachment} href={href} download>
                        {/* The protected endpoint verifies ownership before returning bytes. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${href}?inline=1`} alt={attachment.fileName} />
                        <span><ImageIcon aria-hidden="true" />{attachment.fileName}<small>{fileSizeLabel(attachment.sizeBytes, "MB", "KB")}</small></span>
                      </a>
                    ) : (
                      <a key={attachment.id} href={href} download>
                        <FileText aria-hidden="true" />
                        {attachment.fileName}
                        <small>{fileSizeLabel(attachment.sizeBytes, "MB", "KB")}</small>
                      </a>
                    );
                  })}
                </div>
              ) : null}
              <time dateTime={message.createdAt}>{formatLocalTime(locale, message.createdAt)}</time>
            </div>
          </motion.article>
        );
      })}
      <AnimatePresence>
        {pending ? (
          <motion.div
            className={styles.typing}
            aria-label={t("messenger.sending")}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {[0, 1, 2].map((index) => (
              <motion.i
                key={index}
                animate={shouldReduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.12 }}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Composer({
  conversation,
  onConversation,
  onPendingChange,
}: {
  conversation: SupportConversationView;
  onConversation: (value: SupportConversationView) => void;
  onPendingChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const previewUrl = useMemo(() => file?.type.startsWith("image/") ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function selectFile(next: File | null) {
    setError("");
    if (!next) {
      setFile(null);
      return;
    }
    if (!allowedAttachmentTypes.has(next.type)) {
      setFile(null);
      setError(t("messenger.fileTypeError"));
      return;
    }
    if (next.size < 1 || next.size > maxAttachmentSize) {
      setFile(null);
      setError(t("messenger.fileSizeError"));
      return;
    }
    setFile(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanBody = body.trim();
    if ((!cleanBody && !file) || pending) return;
    setPending(true);
    onPendingChange(true);
    setError("");
    try {
      const response = await fetch(`/api/support/${conversation.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: cleanBody || t("messenger.attachment", { name: file?.name ?? "file" }),
          idempotencyKey: `message-${crypto.randomUUID()}`,
        }),
      });
      let updated = await response.json() as SupportConversationView & { message?: string };
      if (!response.ok) throw new Error(t("messenger.sendError"));

      if (file) {
        const latest = updated.messages.findLast((item) => item.authorType === "USER");
        if (!latest) throw new Error(t("messenger.uploadError"));
        const attachment = new FormData();
        attachment.set("messageId", latest.id);
        attachment.set("file", file);
        const upload = await fetch(`/api/support/${conversation.id}/attachments`, {
          method: "POST",
          body: attachment,
        });
        await upload.json();
        if (!upload.ok) throw new Error(t("messenger.uploadError"));
        const refreshed = await fetch(`/api/support/${conversation.id}`);
        if (refreshed.ok) updated = await refreshed.json() as SupportConversationView;
      }

      onConversation(updated);
      setBody("");
      setFile(null);
      setEmojiOpen(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t("messenger.sendError"));
    } finally {
      setPending(false);
      onPendingChange(false);
    }
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      {file ? (
        <div className={styles.filePreview}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" />
          ) : <FileText aria-hidden="true" />}
          <span><strong>{file.name}</strong><small>{fileSizeLabel(file.size, t("messenger.megabytes"), t("messenger.kilobytes"))}</small></span>
          <button type="button" onClick={() => setFile(null)} aria-label={t("messenger.removeFile", { name: file.name })}><X aria-hidden="true" /></button>
        </div>
      ) : null}
      <label className={styles.iconButton} aria-label={file ? t("messenger.selectedFile", { name: file.name }) : t("messenger.attachFile")}>
        <Paperclip aria-hidden="true" />
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          disabled={pending}
          onChange={(event) => {
            selectFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={t("messenger.addEmoji")}
        aria-expanded={emojiOpen}
        onClick={() => setEmojiOpen((open) => !open)}
      >
        <Smile aria-hidden="true" />
      </button>
      <AnimatePresence>
        {emojiOpen ? (
          <motion.div
            className={styles.emojiMenu}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={t("messenger.addEmojiValue", { emoji })}
                onClick={() => setBody((current) => `${current}${emoji}`)}
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <textarea
        rows={1}
        value={body}
        maxLength={5000}
        placeholder={t("messenger.placeholder")}
        aria-label={t("messenger.placeholder")}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <button
        type="submit"
        className={styles.sendButton}
        disabled={(!body.trim() && !file) || pending}
        aria-label={t("messenger.send")}
      >
        {pending ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Send aria-hidden="true" />}
      </button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <span className="sr-only" aria-live="polite">
        {pending ? t("messenger.sending") : file ? file.name : ""}
      </span>
    </form>
  );
}

function MessengerHeader({
  basePath,
  compact,
  onClose,
}: {
  basePath: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className={styles.header}>
      <span className={styles.avatar} aria-hidden="true">VX</span>
      <div className={styles.manager}>
        <strong>{t("messenger.manager")}</strong>
        <span>{t("messenger.online")}</span>
      </div>
      <div className={styles.headerActions}>
        {compact ? (
          <Link className={styles.iconButton} href={basePath} aria-label={t("messenger.expand")}>
            <Expand aria-hidden="true" />
          </Link>
        ) : null}
        {onClose ? (
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label={t("common.close")}>
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function PersonalMessengerExperience({
  initialConversation,
  basePath,
  unreadCount,
  fullPage,
  onRead,
  onUnreadChange,
}: {
  initialConversation: SupportConversationView;
  basePath: string;
  unreadCount: number;
  fullPage: boolean;
  onRead: () => void | Promise<void>;
  onUnreadChange: (value: number) => void;
}) {
  const { shouldReduceMotion } = useDashboard();
  const { locale, t } = useI18n();
  const [conversation, setConversation] = useState(initialConversation);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(unreadCount > 0);
  const [sending, setSending] = useState(false);
  const latest = conversation.messages.at(-1);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/support/${conversation.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as SupportConversationView;
      if (next.messages.length > conversation.messages.length) {
        const knownIds = new Set(conversation.messages.map((message) => message.id));
        const newIncoming = next.messages.filter((message) => !knownIds.has(message.id) && message.authorType !== "USER").length;
        setConversation(next);
        if (!open && !fullPage && newIncoming > 0) {
          onUnreadChange(unreadCount + newIncoming);
          setPreviewOpen(true);
        } else if (newIncoming > 0) {
          void onRead();
        }
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [conversation.id, conversation.messages, fullPage, onRead, onUnreadChange, open, unreadCount]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (fullPage) {
    return (
      <section className={`${styles.experience} ${styles.full}`} aria-label="Messenger VX House">
        <aside className={styles.dialogList}>
          <header>
            <small>{t("messenger.personalChannel")}</small>
            <h1 tabIndex={-1}>Messenger</h1>
            <p>{t("messenger.personalDescription")}</p>
          </header>
          <div className={styles.conversationItem} aria-current="page">
            <span className={styles.avatar} aria-hidden="true">VX</span>
            <div>
              <strong>{t("messenger.manager")}</strong>
              <p>{messagePreview(latest, t("messenger.empty"))}</p>
            </div>
            <time dateTime={latest?.createdAt}>{latest ? formatLocalTime(locale, latest.createdAt) : ""}</time>
          </div>
        </aside>
        <div className={styles.conversationPanel}>
          <MessengerHeader basePath={basePath} />
          <MessageList conversation={conversation} pending={sending} shouldReduceMotion={shouldReduceMotion} locale={locale} todayLabel={t("common.today")} />
          <Composer
            conversation={conversation}
            onConversation={setConversation}
            onPendingChange={setSending}
          />
        </div>
      </section>
    );
  }

  return (
    <div className={styles.experience}>
      <AnimatePresence>
        {previewOpen && !open ? (
          <motion.div
            className={styles.preview}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5 }}
            transition={transition}
          >
            <button
              type="button"
              className={styles.previewContent}
              onClick={() => {
                setOpen(true);
                setPreviewOpen(false);
                onRead();
              }}
            >
              <strong>{t("messenger.manager")}</strong>
              <p>“{messagePreview(latest, t("messenger.empty"))}”</p>
            </button>
            <button
              type="button"
              className={styles.previewClose}
              aria-label={t("access.hideMessage")}
              onClick={(event) => {
                event.stopPropagation();
                setPreviewOpen(false);
              }}
            >
              <X aria-hidden="true" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.section
            className={styles.mini}
            role="dialog"
            aria-modal="false"
            aria-label="Messenger VX House"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            transition={transition}
          >
            <MessengerHeader basePath={basePath} compact onClose={() => setOpen(false)} />
            <MessageList conversation={conversation} pending={sending} shouldReduceMotion={shouldReduceMotion} locale={locale} todayLabel={t("common.today")} />
            <Composer
              conversation={conversation}
              onConversation={setConversation}
              onPendingChange={setSending}
            />
          </motion.section>
        ) : (
          <motion.button
            type="button"
            className={styles.launcher}
            aria-label={unreadCount ? `${t("messenger.open")}. ${t("workspace.unread", { count: unreadCount })}` : t("messenger.open")}
            onClick={() => {
              setOpen(true);
              setPreviewOpen(false);
              onRead();
            }}
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={shouldReduceMotion ? undefined : { y: -3 }}
            transition={transition}
          >
            <MessageCircle aria-hidden="true" />
            {unreadCount ? (
              <motion.i
                aria-hidden="true"
                animate={shouldReduceMotion ? undefined : { scale: [1, 1.14, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                {unreadCount}
              </motion.i>
            ) : null}
          </motion.button>
        )}
      </AnimatePresence>

      <Link className="sr-only" href={basePath}>
        {t("messenger.open")} <ArrowUpRight aria-hidden="true" />
      </Link>
    </div>
  );
}
