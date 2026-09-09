"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";
import styles from "./vx-id-copy.module.css";

export function VxIdCopy({ vxId, compact = false }: { vxId: string; compact?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(vxId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className={styles.copy} data-compact={compact || undefined} onClick={copy} aria-label={t("account.copyId", { id: vxId })}>
      <span>{vxId}</span>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? <small role="status">{t("common.copied")}</small> : null}
    </button>
  );
}
