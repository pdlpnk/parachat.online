export const PLAYER_AVATAR_EMOJI_POOL = [
  "🐼", "🦊", "🦁", "🐸", "🦄", "🤖", "👾", "👻", "🧙", "🧑‍🚀",
  "🦋", "🐙", "🦜", "🐯", "🐨", "🐵", "🐶", "🐱", "🐭", "🐹",
  "🐰", "🐻", "🐻‍❄️", "🐮", "🐷", "🐽", "🐔", "🐧", "🐦", "🐤",
  "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🫎", "🐝", "🪲",
  "🐞", "🦗", "🕷️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐳",
  "🐬", "🦭", "🐟", "🐠", "🐡", "🦈", "🐊", "🐅", "🐆", "🦓",
  "🦍", "🦧", "🦣", "🐘", "🦛", "🦏", "🐪", "🦒", "🦘", "🦬",
  "🦙", "🐐", "🦌", "🐕", "🐩", "🐈", "🐓", "🦃", "🦚", "🦩",
  "🕊️", "🐇", "🦝", "🦨", "🦡", "🦫", "🦦", "🦥", "🐁", "🐿️",
  "🦔", "🐉", "🐲", "🌵", "🌴", "🌲", "🌳", "🌱", "🍀", "🌻",
  "🌺", "🌸", "🌼", "🌷", "🪷", "🍄", "🌙", "🌞", "⭐", "🌈",
  "☄️", "🪐", "🌍", "🚀", "🛸", "🛰️", "🔭", "🗿", "🏰", "⛵",
  "🚁", "🚂", "🏎️", "🚲", "🎈", "🪁", "🎨", "🎭", "🎸", "🎷",
  "🥁", "🎻", "🎲", "🧩", "🪀", "🛹", "🏄", "🧗", "🥑", "🍉",
  "🍓", "🍒", "🍋", "🍍", "🥝", "🥕", "🌽", "🍄‍🟫", "🥐", "🧁",
  "🍪", "🍩", "🍿", "🧋", "☕", "🫖", "💎", "🔮", "🪄", "🧸",
] as const;

export function avatarEmojiForVxId(vxId: string): string | null {
  const match = /^VX(\d{6})$/u.exec(vxId.trim().toUpperCase());
  if (!match) return null;
  const ordinal = Number(match[1]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) return null;

  const poolSize = PLAYER_AVATAR_EMOJI_POOL.length;
  if (ordinal <= poolSize) return PLAYER_AVATAR_EMOJI_POOL[ordinal - 1];

  // Once the single-emoji pool is exhausted, encode the immutable VX number
  // as a deterministic multi-emoji combination. This keeps registration
  // available without introducing client-side or random assignment.
  let value = ordinal - poolSize - 1;
  const parts: string[] = [];
  do {
    parts.unshift(PLAYER_AVATAR_EMOJI_POOL[value % poolSize]);
    value = Math.floor(value / poolSize);
  } while (value > 0);
  while (parts.length < 2) parts.unshift(PLAYER_AVATAR_EMOJI_POOL[0]);
  return parts.join("");
}
