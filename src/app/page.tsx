import { cookies } from "next/headers";
import { PlayerMessenger } from "@/components/player-messenger";
import { NameForm } from "@/components/name-form";
import { getDatabase } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { cookiePolicy } from "@/server/identity/http";
import { resolvePlayer } from "@/server/identity/service";

export const dynamic = "force-dynamic";
export default async function Home() {
  const jar = await cookies();
  let player;
  try {
    player = await resolvePlayer(getDatabase(), jar.get(cookiePolicy().client)?.value, getServerEnv().CLIENT_CREDENTIAL_PEPPER);
  } catch {
    return <main className="landing"><section className="name-card"><h1>LINA</h1><p role="alert">Чат временно недоступен. Обновите страницу через минуту.</p></section></main>;
  }
  if (!player) return <NameForm />;
  return <PlayerMessenger liId={player.liId} initialMessages={player.messages} />;
}
