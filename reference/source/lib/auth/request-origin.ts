const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface TrustedRequestOriginOptions {
  readonly allowedOrigins?: readonly string[];
  readonly trustProxyHeaders?: boolean;
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function forwardedOrigin(request: Request) {
  const protocol = firstForwardedValue(request.headers.get("x-forwarded-proto"))?.toLowerCase();
  const host = firstForwardedValue(request.headers.get("x-forwarded-host"))
    ?? request.headers.get("host")?.trim()
    ?? null;
  if (!protocol || !host || !["http", "https"].includes(protocol)) return null;
  if (/[/\\\s@]/u.test(host)) return null;
  return normalizeOrigin(`${protocol}://${host}`);
}

export function hasTrustedRequestOrigin(
  request: Request,
  options: TrustedRequestOriginOptions | readonly string[] = {},
) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

  const origin = normalizeOrigin(request.headers.get("origin"));
  if (!origin) return false;

  const resolved = Array.isArray(options)
    ? { allowedOrigins: options, trustProxyHeaders: false }
    : options as TrustedRequestOriginOptions;
  const trusted = new Set<string>();
  const directOrigin = normalizeOrigin(request.url);
  if (directOrigin) trusted.add(directOrigin);
  for (const allowed of resolved.allowedOrigins ?? []) {
    const normalized = normalizeOrigin(allowed);
    if (normalized) trusted.add(normalized);
  }
  if (resolved.trustProxyHeaders) {
    const proxyOrigin = forwardedOrigin(request);
    if (proxyOrigin) trusted.add(proxyOrigin);
  }
  return trusted.has(origin);
}
