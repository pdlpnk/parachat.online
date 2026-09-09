import type { AuthorizationRequest, PolicyAuthorizationDecision } from "./authorization-types";
import type { PermissionEvaluationService } from "@/lib/services";

export class PolicyAuthorizationDeniedError extends Error {
  readonly code = "POLICY_AUTHORIZATION_DENIED";

  constructor(readonly decision: PolicyAuthorizationDecision) {
    super("Доступ запрещён серверной политикой");
    this.name = "PolicyAuthorizationDeniedError";
  }
}

export function requirePolicyAuthorization(
  evaluator: PermissionEvaluationService,
  request: AuthorizationRequest,
) {
  const decision = evaluator.evaluate(request);
  if (!decision.allowed) throw new PolicyAuthorizationDeniedError(decision);
  return decision;
}
