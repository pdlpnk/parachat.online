import "server-only";

import { SessionCookieManager, SessionTokenManager } from "@/lib/auth";
import { getServerConfig } from "@/lib/config";
import { getDatabase } from "@/lib/db";
import { PrismaAuthRepository } from "@/lib/repositories";
import { AuthenticationService } from "@/lib/services";

export function createAuthenticationSystem() {
  const config = getServerConfig();
  const repository = new PrismaAuthRepository(getDatabase());
  const authenticationConfig = config.security.authentication;
  const tokens = new SessionTokenManager(authenticationConfig.sessionSecret.reveal());
  const cookies = new SessionCookieManager({
    secure: authenticationConfig.secureCookies,
    maxAgeSeconds: authenticationConfig.sessionIdleTtlSeconds,
  });
  const service = new AuthenticationService(repository, tokens, cookies, {
    sessionIdleTtlSeconds: authenticationConfig.sessionIdleTtlSeconds,
    sessionAbsoluteTtlSeconds: authenticationConfig.sessionAbsoluteTtlSeconds,
    sessionRefreshAfterSeconds: authenticationConfig.sessionRefreshAfterSeconds,
  });

  return Object.freeze({ service, cookies, repository });
}

export type AuthenticationSystem = ReturnType<typeof createAuthenticationSystem>;
