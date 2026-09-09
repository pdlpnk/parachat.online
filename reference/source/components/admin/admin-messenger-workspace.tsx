"use client";
/* eslint-disable @next/next/no-img-element -- previews come from protected authenticated routes and local File objects */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Download, FileText, Image as ImageIcon, Info, LoaderCircle, MessageCircle, MoreHorizontal, NotebookPen, Paperclip, Pencil, Search, Send, Smile, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";
import { AdminTagManager, TagChips, TagFilters } from "@/components/admin/admin-tag-controls";
import { VxIdCopy } from "@/components/ui/vx-id-copy";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AdminTagAssignmentView, AdminTagView } from "@/lib/admin-tags";
import type { AdminMessengerDetail, AdminMessengerList, AdminMessengerNote, AdminMessengerPlayer, AdminMessengerScope } from "@/lib/admin-messenger";
import { formatLocalDateTime, formatLocalTime } from "@/lib/i18n";
import type { SupportMessageView } from "@/lib/support";
import styles from "./admin-messenger-workspace.module.css";

const transition = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const };
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const emojis = ["🙂", "👍", "❤️", "✨", "👋", "✅"];

function size(value: number, megabytes: string, kilobytes: string) {
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} ${megabytes}` : `${Math.max(1, Math.round(value / 1024))} ${kilobytes}`;
}

function ChatListItem({ item, active, onClick }: { item: AdminMessengerPlayer; active: boolean; onClick: () => void }) {
  const { locale, t } = useI18n();
  return (
    <button type="button" className={styles.chatItem} data-active={active || undefined} onClick={onClick}>
      <UserAvatar className={styles.avatar} name={item.name} avatarEmoji={item.avatarEmoji} status={item.online ? "online" : "offline"} ariaLabel={`${item.name}: ${item.online ? t("adminMessenger.online") : t("adminMessenger.offline")}`} />
      <span className={styles.chatCopy}>
        <span><strong>{item.name}</strong><time dateTime={item.lastMessageAt ?? undefined}>{item.lastMessageAt ? formatLocalTime(locale, item.lastMessageAt) : ""}</time></span>
        <span className={styles.chatVxId}>{item.vxId}</span>
        <span><small>{item.lastMessage}</small>{item.hasNotes ? <NotebookPen aria-label={t("adminMessenger.hasNote")} /> : null}</span>
        <TagChips tags={item.tags} />
      </span>
      {item.unreadCount ? <b aria-label={t("adminMessenger.unread", { count: item.unreadCount })}>{item.unreadCount}</b> : null}
    </button>
  );
}

function Attachment({ conversationId, attachment }: { conversationId: string; attachment: SupportMessageView["attachments"][number] }) {
  const { t } = useI18n();
  const href = `/api/admin/messenger/${conversationId}/attachments/${attachment.id}`;
  if (attachment.mediaType.startsWith("image/")) {
    return (
      <a className={styles.messageImage} href={href} download>
        {/* Protected route handles authorization before returning image bytes. */}
        <img src={`${href}?inline=1`} alt={t("messenger.attachmentAlt", { name: attachment.fileName })} />
        <span><ImageIcon aria-hidden="true" />{attachment.fileName}<small>{size(attachment.sizeBytes, t("messenger.megabytes"), t("messenger.kilobytes"))}</small><Download aria-hidden="true" /></span>
      </a>
    );
  }
  return <a className={styles.messageFile} href={href} download><FileText aria-hidden="true" /><span>{attachment.fileName}<small>{size(attachment.sizeBytes, t("messenger.megabytes"), t("messenger.kilobytes"))}</small></span><Download aria-hidden="true" /></a>;
}

function Messages({ detail, pending }: { detail: AdminMessengerDetail; pending: boolean }) {
  const { locale, t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restoredConversation = useRef("");
  const stickToBottom = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const list = scrollRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    const list = scrollRef.current;
    if (!list) return;
    if (restoredConversation.current !== detail.conversation.id) {
      restoredConversation.current = detail.conversation.id;
      stickToBottom.current = true;
      scrollToBottom();
      return;
    }
    if (stickToBottom.current) scrollToBottom("smooth");
  }, [detail.conversation.id, detail.conversation.messages.length, pending, scrollToBottom]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [detail.conversation.id, scrollToBottom]);

  return (
    <div
      ref={scrollRef}
      className={styles.messages}
      aria-live="polite"
      onScroll={(event) => {
        const list = event.currentTarget;
        stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      }}
    >
      <div ref={contentRef} className={styles.messageStream}>
        <div className={styles.dayLabel}>{t("adminMessenger.history")}</div>
        {detail.conversation.messages.length ? detail.conversation.messages.map((message) => {
          const author = message.authorType === "OPERATOR" ? "admin" : message.authorType === "USER" ? "player" : "system";
          return (
            <motion.article key={message.id} className={styles.message} data-author={author} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
              {author === "system" ? <span className={styles.messageAvatar}>VX</span> : author === "player" ? <UserAvatar className={styles.messageAvatar} name={detail.player.name} avatarEmoji={detail.player.avatarEmoji} ariaHidden /> : null}
              <div>
                <small>{message.authorLabel}</small>
                <p>{message.body}</p>
                {message.attachments.length ? <div className={styles.messageAttachments}>{message.attachments.map((attachment) => <Attachment key={attachment.id} conversationId={detail.conversation.id} attachment={attachment} />)}</div> : null}
                <time dateTime={message.createdAt}>{formatLocalTime(locale, message.createdAt)}</time>
              </div>
            </motion.article>
          );
        }) : <div className={styles.emptyMessages}><MessageCircle aria-hidden="true" /><strong>{t("adminMessenger.emptyHistory")}</strong><p>{t("adminMessenger.emptyHistoryDescription")}</p></div>}
        {pending ? <div className={styles.sending}><i /><i /><i /></div> : null}
      </div>
    </div>
  );
}

function AdminComposer({ detail, onUpdate }: { detail: AdminMessengerDetail; onUpdate: (value: AdminMessengerDetail) => void }) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);

  const previewUrl = useMemo(() => file?.type.startsWith("image/") ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function choose(next: File | null) {
    setError("");
    if (!next) return setFile(null);
    if (!allowedTypes.has(next.type)) return setError(t("messenger.fileTypeError"));
    if (next.size < 1 || next.size > 10 * 1024 * 1024) return setError(t("messenger.fileSizeError"));
    setFile(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((!body.trim() && !file) || pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/admin/messenger/${detail.conversation.id}/messages`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: body.trim() || t("messenger.attachment", { name: file?.name ?? "" }) }),
      });
      let updated = await response.json() as AdminMessengerDetail & { message?: string };
      if (!response.ok) throw new Error(t("messenger.sendError"));
      if (file) {
        const latest = updated.conversation.messages.findLast((message) => message.authorType === "OPERATOR");
        if (!latest) throw new Error(t("messenger.uploadError"));
        const form = new FormData(); form.set("messageId", latest.id); form.set("file", file);
        const upload = await fetch(`/api/admin/messenger/${detail.conversation.id}/attachments`, { method: "POST", body: form });
        await upload.json();
        if (!upload.ok) throw new Error(t("messenger.uploadError"));
        const refresh = await fetch(`/api/admin/messenger/${detail.conversation.id}`, { cache: "no-store" });
        if (refresh.ok) updated = await refresh.json() as AdminMessengerDetail;
      }
      onUpdate(updated); setBody(""); setFile(null); setEmojiOpen(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t("messenger.sendError"));
    } finally { setPending(false); }
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      {file ? <div className={styles.selectedFile}>
        {previewUrl ? <img src={previewUrl} alt="" /> : <FileText aria-hidden="true" />}
        <span><strong>{file.name}</strong><small>{size(file.size, t("messenger.megabytes"), t("messenger.kilobytes"))}</small></span>
        <button type="button" onClick={() => setFile(null)} aria-label={t("adminMessenger.removeFile", { name: file.name })}><X aria-hidden="true" /></button>
      </div> : null}
      <label className={styles.composerIcon} aria-label={t("adminMessenger.attach")}><Paperclip aria-hidden="true" /><input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" disabled={pending} onChange={(event) => { choose(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /></label>
      <button type="button" className={styles.composerIcon} aria-label={t("adminMessenger.emoji")} aria-expanded={emojiOpen} onClick={() => setEmojiOpen((value) => !value)}><Smile aria-hidden="true" /></button>
      <AnimatePresence>{emojiOpen ? <motion.div className={styles.emojiMenu} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{emojis.map((emoji) => <button key={emoji} type="button" onClick={() => setBody((value) => value + emoji)}>{emoji}</button>)}</motion.div> : null}</AnimatePresence>
      <textarea value={body} rows={1} maxLength={5000} aria-label={t("adminMessenger.messageFor", { name: detail.player.name })} placeholder={t("messenger.placeholder")} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      <button className={styles.send} disabled={(!body.trim() && !file) || pending} aria-label={t("adminMessenger.send")}>{pending ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Send aria-hidden="true" />}</button>
      {error ? <p className={styles.error} role="alert">{error} <button type="button" onClick={() => setError("")}>{t("adminMessenger.close")}</button></p> : null}
    </form>
  );
}

function PlayerPanel({ detail, tags, onUpdate, onTagsChange, onClose }: { detail: AdminMessengerDetail; tags: AdminTagView[]; onUpdate: (value: AdminMessengerDetail) => void; onTagsChange: (value: AdminTagView[]) => void; onClose: () => void }) {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<AdminMessengerNote | null>(null);
  const [pending, setPending] = useState(false);

  async function save(action: "create" | "edit" | "delete", note?: AdminMessengerNote) {
    if (action === "delete" && !window.confirm(t("adminMessenger.deleteNoteConfirm"))) return;
    setPending(true);
    const response = await fetch(`/api/admin/messenger/${detail.conversation.id}/notes`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, logicalId: note?.logicalId ?? editing?.logicalId, body: action === "edit" ? draft : action === "create" ? draft : undefined }),
    });
    if (response.ok) { onUpdate(await response.json() as AdminMessengerDetail); setDraft(""); setEditing(null); }
    setPending(false);
  }

  return (
    <aside className={styles.playerPanel} aria-label={t("adminMessenger.memberInfo")}>
      <header><div><small>{detail.player.role === "PARTNER" ? t("adminMessenger.partnerProfile") : t("adminMessenger.playerProfile")}</small><strong>{detail.player.name}</strong></div><button type="button" onClick={onClose} aria-label={t("adminMessenger.infoClose")}><X aria-hidden="true" /></button></header>
      <div className={styles.profileBlock}><UserAvatar className={styles.profileAvatar} name={detail.player.name} avatarEmoji={detail.player.avatarEmoji} status={detail.player.online ? "online" : "offline"} ariaLabel={`${detail.player.name}: ${detail.player.online ? t("adminMessenger.online") : t("adminMessenger.offline")}`} /><strong>{detail.player.name}</strong><small>{detail.player.email}</small><VxIdCopy vxId={detail.player.vxId} compact /><TagChips tags={detail.player.tags} /><AdminTagManager userId={detail.player.userId} assigned={detail.player.tags} tags={tags} onAssignedChange={(next) => onUpdate({ ...detail, player: { ...detail.player, tags: next } })} onTagsChange={onTagsChange} /><Link href={detail.player.profileHref}>{t("adminMessenger.fullProfile")}</Link></div>
      <dl className={styles.profileFacts}>
        <div><dt>{t("adminMessenger.role")}</dt><dd>{detail.player.role === "PARTNER" ? t("adminMessenger.partnerRole") : t("adminMessenger.playerRole")}</dd></div><div><dt>{t("adminMessenger.market")}</dt><dd>{detail.player.market}</dd></div>
        <div><dt>{t("adminMessenger.registered")}</dt><dd>{formatLocalDateTime(locale, detail.player.registeredAt)}</dd></div>
      </dl>
      <section className={styles.notes}>
        <header><div><small>{t("adminMessenger.adminOnly")}</small><h2>{t("adminMessenger.notes")}</h2></div><NotebookPen aria-hidden="true" /></header>
        <textarea value={draft} maxLength={3000} placeholder={editing ? t("adminMessenger.editNote") : t("adminMessenger.addNote")} aria-label={t("adminMessenger.notes")} onChange={(event) => setDraft(event.target.value)} />
        <div className={styles.noteActions}>{editing ? <button type="button" onClick={() => { setEditing(null); setDraft(""); }}>{t("adminMessenger.cancel")}</button> : null}<button type="button" disabled={!draft.trim() || pending} onClick={() => save(editing ? "edit" : "create")}>{pending ? t("adminMessenger.saving") : editing ? t("adminMessenger.save") : t("adminMessenger.add")}</button></div>
        <div className={styles.noteHistory}>{detail.notes.length ? detail.notes.map((note) => <article key={note.logicalId}><p>{note.body}</p><small>{note.author} · {formatLocalDateTime(locale, note.createdAt)}{note.modifiedAt ? ` · ${formatLocalDateTime(locale, note.modifiedAt)}` : ""}</small><div><button type="button" onClick={() => { setEditing(note); setDraft(note.body); }} aria-label={t("adminMessenger.editNote")}><Pencil aria-hidden="true" /></button><button type="button" onClick={() => save("delete", note)} aria-label={t("adminMessenger.close")}><Trash2 aria-hidden="true" /></button></div></article>) : <p className={styles.noNotes}>{t("adminMessenger.noNotes")}</p>}</div>
      </section>
    </aside>
  );
}

export function AdminMessengerWorkspace({ initialList, initialDetail }: { initialList: AdminMessengerList; initialDetail: AdminMessengerDetail | null }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [list, setList] = useState(initialList);
  const [detail, setDetail] = useState(initialDetail);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [scope, setScope] = useState<AdminMessengerScope>("active");
  const [tagId, setTagId] = useState("");
  const pollingRef = useRef(false);
  const selectedId = detail?.conversation.id;

  const visible = useMemo(() => list.items, [list.items]);

  const loadList = useCallback(async (query = search, nextScope = scope, nextTag = tagId) => {
    const response = await fetch(`/api/admin/messenger?q=${encodeURIComponent(query)}&scope=${nextScope}&tag=${encodeURIComponent(nextTag)}`, { cache: "no-store" });
    if (response.ok) setList(await response.json() as AdminMessengerList);
  }, [scope, search, tagId]);

  function changeScope(nextScope: AdminMessengerScope) {
    setScope(nextScope);
    setDetail(null);
    setMobileChat(false);
    setPanelOpen(false);
    void loadList(search, nextScope, tagId);
  }

  async function openChat(item: AdminMessengerPlayer) {
    setLoading(true); setMobileChat(true);
    const response = await fetch(`/api/admin/messenger/${item.conversationId}`, { cache: "no-store" });
    if (response.ok) {
      setDetail(await response.json() as AdminMessengerDetail);
      await fetch(`/api/admin/messenger/${item.conversationId}/read`, { method: "POST" });
      await loadList();
    }
    setLoading(false);
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("vx-house:admin-messenger-tag");
    if (saved) queueMicrotask(() => setTagId(saved));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(search), 220);
    return () => window.clearTimeout(timer);
  }, [loadList, search]);

  function selectTag(next: string) {
    setTagId(next);
    window.localStorage.setItem("vx-house:admin-messenger-tag", next);
    setDetail(null); setMobileChat(false); setPanelOpen(false);
    void loadList(search, scope, next);
  }

  function updateAssigned(next: AdminTagAssignmentView[]) {
    if (!detail) return;
    setDetail({ ...detail, player: { ...detail.player, tags: next } });
    setList((current) => ({ ...current, items: current.items.map((item) => item.userId === detail.player.userId ? { ...item, tags: next } : item) }));
  }

  function updateAvailableTags(next: AdminTagView[]) {
    setList((current) => ({ ...current, tags: next }));
    if (tagId && !next.some((tag) => tag.id === tagId)) selectTag("");
    else void loadList();
  }

  useEffect(() => {
    if (!selectedId) return;
    void fetch(`/api/admin/messenger/${selectedId}/read`, { method: "POST" }).then(() => loadList());
  }, [loadList, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (document.hidden || pollingRef.current) return;
      pollingRef.current = true;
      try {
        await loadList();
        if (selectedId) {
          const response = await fetch(`/api/admin/messenger/${selectedId}`, { cache: "no-store" });
          if (response.ok) setDetail(await response.json() as AdminMessengerDetail);
        }
      } finally {
        pollingRef.current = false;
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [loadList, selectedId, search]);

  return (
    <section className={styles.workspace} data-mobile-chat={mobileChat || undefined} data-panel-open={panelOpen || undefined}>
      <aside className={styles.chatList}>
        <header><div><small>{t("adminMessenger.channel")}</small><h1 tabIndex={-1}>Messenger</h1></div>{scope === "active" && list.unreadCount ? <b>{list.unreadCount}</b> : null}</header>
        <div className={styles.scopeTabs} role="tablist" aria-label={t("adminMessenger.listMode")}>
          <button type="button" role="tab" aria-selected={scope === "active"} data-active={scope === "active" || undefined} onClick={() => changeScope("active")}>{t("adminMessenger.active")}</button>
          <button type="button" role="tab" aria-selected={scope === "archive"} data-active={scope === "archive" || undefined} onClick={() => changeScope("archive")}>{t("adminMessenger.archive")}</button>
        </div>
        <div className={styles.tagFilters}><TagFilters tags={list.tags} selected={tagId} onSelect={selectTag} /></div>
        <label className={styles.search}><Search aria-hidden="true" /><span className="sr-only">{t("adminMessenger.search")}</span><input value={search} placeholder={t("adminMessenger.searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className={styles.chatItems}>{visible.length ? visible.map((item) => <ChatListItem key={item.conversationId} item={item} active={selectedId === item.conversationId} onClick={() => openChat(item)} />) : <div className={styles.emptyList}><MessageCircle aria-hidden="true" /><strong>{scope === "active" ? t("adminMessenger.noActive") : t("adminMessenger.noArchive")}</strong><p>{scope === "active" ? t("adminMessenger.noActiveDescription") : t("adminMessenger.noArchiveDescription")}</p></div>}</div>
      </aside>

      <main className={styles.conversation}>
        {loading ? <div className={styles.loading}><LoaderCircle aria-hidden="true" /><span>{t("adminMessenger.loading")}</span></div> : detail ? <>
          <header className={styles.conversationHeader}>
            <button type="button" className={styles.mobileBack} onClick={() => setMobileChat(false)} aria-label={t("adminMessenger.back")}><ArrowLeft aria-hidden="true" /></button>
            <UserAvatar className={styles.avatar} name={detail.player.name} avatarEmoji={detail.player.avatarEmoji} status={detail.player.online ? "online" : "offline"} ariaLabel={`${detail.player.name}: ${detail.player.online ? t("adminMessenger.online") : t("adminMessenger.offline")}`} />
            <div className={styles.conversationIdentity}><strong>{detail.player.name}</strong><small>{detail.player.vxId} · {detail.player.online ? t("adminMessenger.online") : t("adminMessenger.offline")}</small><TagChips tags={detail.player.tags} /></div>
            <AdminTagManager userId={detail.player.userId} assigned={detail.player.tags} tags={list.tags} onAssignedChange={updateAssigned} onTagsChange={updateAvailableTags} />
            <button type="button" className={styles.infoButton} data-active={panelOpen || undefined} onClick={() => setPanelOpen((open) => !open)} aria-label={panelOpen ? t("adminMessenger.infoClose") : t("adminMessenger.infoOpen")} aria-expanded={panelOpen}><Info aria-hidden="true" /></button>
          </header>
          <Messages detail={detail} pending={false} />
          <AdminComposer detail={detail} onUpdate={(value) => { setDetail(value); void loadList(); }} />
        </> : <div className={styles.noSelection}><MessageCircle aria-hidden="true" /><strong>{t("adminMessenger.select")}</strong><p>{t("adminMessenger.selectDescription")}</p></div>}
      </main>

      <AnimatePresence>
        {detail && panelOpen ? <motion.div className={styles.panelWrap} data-open initial={reduced ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: 12 }} transition={transition}><PlayerPanel detail={detail} tags={list.tags} onUpdate={(next) => { setDetail(next); setList((current) => ({ ...current, items: current.items.map((item) => item.userId === next.player.userId ? { ...item, tags: next.player.tags } : item) })); }} onTagsChange={updateAvailableTags} onClose={() => setPanelOpen(false)} /></motion.div> : null}
      </AnimatePresence>
      {panelOpen ? <button type="button" className={styles.panelOverlay} onClick={() => setPanelOpen(false)} aria-label={t("adminMessenger.infoClose")} /> : null}
      <button type="button" className="sr-only"><MoreHorizontal aria-hidden="true" />{t("adminMessenger.moreActions")}</button>
    </section>
  );
}
