export function validateDisplayName(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 320) return null;
  const name = input.trim().normalize("NFC");
  // Reject controls, lone surrogates and bidi/zero-width formatting; allow Unicode letters and emoji.
  if (!name || [...name].length > 80 || /[\p{Cc}\p{Cs}\p{Cf}]/u.test(name) || !/[^\p{Z}\p{M}]/u.test(name)) return null;
  return name;
}
export function systemText(key: string | null, params: unknown): string {
  if (key === "system.welcome" && params && typeof params === "object" && "name" in params) {
    const name = validateDisplayName(params.name);
    if (name) return `Привет, ${name}! 👋\n\nЭто ваш личный чат с менеджером. Здесь вы сможете задать вопрос и получить ответ.`;
  }
  return "Системное сообщение.";
}
