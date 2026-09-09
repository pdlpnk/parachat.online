import "server-only";

import { PermissionEvaluationService } from "@/lib/services";

export function createAuthorizationSystem() {
  return Object.freeze({ permissions: new PermissionEvaluationService() });
}

export type AuthorizationSystem = ReturnType<typeof createAuthorizationSystem>;
