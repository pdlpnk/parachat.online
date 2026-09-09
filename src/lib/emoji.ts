import { formatLiId } from "./li-id";

export const CLIENT_EMOJI_POOL = [
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


/** Pure mapping for server-side assignment. Persist once; never recompute existing clients. */
export function emojiForLiNumber(number: number): string {
  formatLiId(number); // Validate the same range used by PostgreSQL.
  const size = CLIENT_EMOJI_POOL.length;
  if (number <= size) return CLIENT_EMOJI_POOL[number - 1]!;
  let value = number - size - 1;
  const parts: string[] = [];
  do {
    parts.unshift(CLIENT_EMOJI_POOL[value % size]!);
    value = Math.floor(value / size);
  } while (value > 0);
  while (parts.length < 2) parts.unshift(CLIENT_EMOJI_POOL[0]);
  return parts.join("");
}
