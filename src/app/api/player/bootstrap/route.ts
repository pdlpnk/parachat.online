import { cookies } from "next/headers";
import { getDatabase } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { BOOTSTRAP_SECONDS, credentialHash, issueBootstrap, readBootstrap } from "@/server/identity/crypto";
import { cookiePolicy, failure, requireOrigin, response } from "@/server/identity/http";
import { resolvePlayer } from "@/server/identity/service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const jar = await cookies();
    const policy = cookiePolicy();
    const pepper = getServerEnv().CLIENT_CREDENTIAL_PEPPER;
    const player = await resolvePlayer(getDatabase(), jar.get(policy.client)?.value, pepper);
    const result = response({ authenticated: Boolean(player) });
    if (player) {
      result.cookies.set(policy.bootstrap, "", { ...policy.flags, maxAge: 0 });
      return result;
    }
    if (jar.has(policy.client)) result.cookies.set(policy.client, "", { ...policy.flags, maxAge: 0 });
    const ticket = readBootstrap(jar.get(policy.bootstrap)?.value, pepper);
    const previous = ticket ? await getDatabase().clientCredential.findUnique({
      where: { credentialHash: credentialHash(ticket.raw, pepper) }, select: { revokedAt: true, expiresAt: true },
    }) : null;
    if (!ticket || (previous && (previous.revokedAt || previous.expiresAt <= new Date()))) {
      result.cookies.set(policy.bootstrap, issueBootstrap(pepper), { ...policy.flags, maxAge: BOOTSTRAP_SECONDS });
    }
    return result;
  } catch (error) { return failure(error); }
}
