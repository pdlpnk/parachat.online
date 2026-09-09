import styles from "./user-avatar.module.css";

type UserAvatarProps = {
  name: string;
  avatarEmoji?: string | null;
  avatarUrl?: string | null;
  className?: string;
  status?: "online" | "offline";
  ariaLabel?: string;
  ariaHidden?: boolean;
};

function initials(name: string) {
  return name.trim().split(/\s+/u).slice(0, 2).map((part) => part[0] ?? "").join("").toLocaleUpperCase() || "VX";
}

export function UserAvatar({ name, avatarEmoji, avatarUrl, className, status, ariaLabel, ariaHidden }: UserAvatarProps) {
  return (
    <span
      className={`${styles.root}${className ? ` ${className}` : ""}`}
      data-status={status}
      aria-label={ariaHidden ? undefined : ariaLabel ?? name}
      aria-hidden={ariaHidden || undefined}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- future protected avatar assets may not be Next Image compatible
        <img className={styles.image} src={avatarUrl} alt="" />
      ) : avatarEmoji ? (
        <span className={styles.emoji} data-avatar-emoji>{avatarEmoji}</span>
      ) : (
        <span className={styles.initials}>{initials(name)}</span>
      )}
    </span>
  );
}
