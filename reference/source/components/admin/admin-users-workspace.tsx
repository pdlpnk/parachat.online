"use client";

import { Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import styles from "@/app/dashboard/dashboard.module.css";
import { AdminTagManager, TagChips, TagFilters } from "@/components/admin/admin-tag-controls";
import { DashboardHeading, DashboardPage, StatusPill } from "@/components/dashboard/dashboard-ui";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Card } from "@/components/ui/card";
import { VxIdCopy } from "@/components/ui/vx-id-copy";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AdminListQuery, AdminSectionView } from "@/lib/admin";
import type { AdminTagAssignmentView, AdminTagView } from "@/lib/admin-tags";

export function AdminUsersWorkspace({ initialData, initialTags, initialQuery }: { initialData: AdminSectionView; initialTags: AdminTagView[]; initialQuery: AdminListQuery }) {
  const { t } = useI18n();
  const [data, setData] = useState(initialData);
  const [tags, setTags] = useState(initialTags);
  const [search, setSearch] = useState(initialQuery.search ?? "");
  const [tagId, setTagId] = useState(initialQuery.tagId ?? "");

  const load = useCallback(async (query = search, selectedTag = tagId) => {
    const params = new URLSearchParams(); if (query.trim()) params.set("search", query.trim()); if (selectedTag) params.set("tag", selectedTag);
    const response = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
    if (response.ok) setData(await response.json() as AdminSectionView);
  }, [search, tagId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 220); return () => window.clearTimeout(timer); }, [load]);

  function updateUserTags(userId: string, next: AdminTagAssignmentView[]) {
    setData((current) => ({ ...current, items: current.items.map((item) => item.id === userId ? { ...item, tags: next } : item) }));
  }

  async function updateTags(next: AdminTagView[]) {
    setTags(next);
    if (tagId && !next.some((tag) => tag.id === tagId)) {
      setTagId("");
      await load(search, "");
      return;
    }
    await load();
  }

  return <DashboardPage>
    <DashboardHeading eyebrow={t("adminUsers.eyebrow")} title={t("page.users")} description={t("adminUsers.description")} action={<StatusPill tone="success">{data.total}</StatusPill>} />
    <section className={styles.adminCatalog}>
      <TagFilters tags={tags} selected={tagId} onSelect={(value) => { setTagId(value); void load(search, value); }} />
      <label className={styles.adminUserSearch}><Search aria-hidden="true" /><span className="sr-only">{t("adminMessenger.search")}</span><input value={search} placeholder={t("adminMessenger.searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className={styles.adminEntityList}>{data.items.length ? data.items.map((user) => <Card className={styles.adminEntityCard} key={user.id}>
        <UserAvatar className={styles.adminEntityAvatar} name={user.title} avatarEmoji={user.avatarEmoji} /><div><small>{user.eyebrow}</small><h3>{user.title}</h3>{user.vxId ? <VxIdCopy vxId={user.vxId} compact /> : null}<p>{user.description}</p><TagChips tags={user.tags ?? []} /><dl><div><dt>{t("adminUsers.status")}</dt><dd>{user.status}</dd></div></dl></div>
        <div className={styles.adminUserActions}><AdminTagManager userId={user.id} assigned={user.tags ?? []} tags={tags} onAssignedChange={(next) => updateUserTags(user.id, next)} onTagsChange={(next) => void updateTags(next)} /><Link href={`/admin/users/${user.id}`}>{t("adminUsers.open")}</Link></div>
      </Card>) : <Card className={styles.adminEntityCard}><div className={styles.adminEntityIcon}><UsersRound aria-hidden="true" /></div><div><h3>{t("adminUsers.empty")}</h3><p>{t("adminUsers.emptyDescription")}</p></div></Card>}</div>
    </section>
  </DashboardPage>;
}
