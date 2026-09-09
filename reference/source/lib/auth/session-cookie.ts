import "server-only";

const PRODUCTION_COOKIE_NAME = "__Host-vx_house_session";
const DEVELOPMENT_COOKIE_NAME = "vx_house_session";

export interface SessionCookieConfig {
  readonly secure: boolean;
  readonly maxAgeSeconds: number;
}

function serialize(name: string, value: string, attributes: readonly string[]) {
  return [`${name}=${value}`, ...attributes].join("; ");
}

export class SessionCookieManager {
  readonly name: string;

  constructor(private readonly config: SessionCookieConfig) {
    this.name = config.secure ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME;
  }

  read(request: Request) {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return null;

    for (const part of cookieHeader.split(";")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      const name = part.slice(0, separator).trim();
      if (name !== this.name) continue;
      const value = part.slice(separator + 1).trim();
      return value || null;
    }
    return null;
  }

  create(value: string, maxAgeSeconds = this.config.maxAgeSeconds) {
    const attributes = [
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
      "Priority=High",
    ];
    if (this.config.secure) attributes.push("Secure");
    return serialize(this.name, value, attributes);
  }

  clear() {
    const attributes = [
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Priority=High",
    ];
    if (this.config.secure) attributes.push("Secure");
    return serialize(this.name, "", attributes);
  }
}
