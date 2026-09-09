import { notFound } from "next/navigation";
import { Messenger, type MessageView } from "@/components/messenger";
import { systemText } from "@/lib/player";

export const dynamic = "force-dynamic";

/** Standalone UI fixtures: no identity imports, cookies, DB calls or message mutations. */
export default function MessengerPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const messages: MessageView[] = [
    { id: "welcome", kind: "SYSTEM", text: systemText("system.welcome", { name: "Роман" }), time: "10:24" },
    { id: "user-1", kind: "USER", text: "Привет!", time: "10:25" },
    { id: "operator-1", kind: "OPERATOR", text: "Здравствуйте 👋 Чем могу помочь?", time: "10:25" },
    { id: "user-2", kind: "USER", text: "Хочу уточнить один вопрос.", time: "10:26" },
    { id: "operator-2", kind: "OPERATOR", text: "Конечно, расскажите подробнее. Можно написать всё одним сообщением или разделить на несколько — как вам удобнее.", time: "10:26" },
    { id: "user-3", kind: "USER", text: "Спасибо! Иногда я возвращаюсь к вопросу позже. Хочется, чтобы весь разговор оставался в одном месте и можно было спокойно перечитать ответ.", time: "10:27" },
    { id: "operator-3", kind: "OPERATOR", text: "Понимаю. Так гораздо проще продолжать разговор, не объясняя всё заново.\n\nНапишите, с чего начнём.", time: "10:28" },
    { id: "wrap", kind: "USER", text: "И ещё проверяю длинную строку: ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", time: "10:29" },
    { id: "last", kind: "OPERATOR", text: "Да, я вас понял. Давайте разберёмся вместе.", time: "10:30" },
  ];
  return <Messenger liId="LI000224" messages={messages} preview />;
}
