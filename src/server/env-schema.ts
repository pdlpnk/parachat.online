import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).refine((value) => {
    try {
      const url = new URL(value);
      return ["postgres:", "postgresql:"].includes(url.protocol)
        && Boolean(url.hostname) && url.pathname.length > 1
        && !value.includes("CHANGE_ME");
    } catch { return false; }
  }),
  // Runtime-only identity configuration.
  LINA_ORIGIN: z.string().url().refine((value) => {
    try { const url = new URL(value); return url.origin === value && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))); } catch { return false; }
  }),
  CLIENT_CREDENTIAL_PEPPER: z.string().regex(/^[a-fA-F0-9]{64}$/),
});

export type ServerEnv = z.infer<typeof schema>;

/** Pure validator for tests. Errors contain field names only, never values. */
export function parseServerEnv(input: Record<string, string | undefined>): ServerEnv {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Invalid server environment: ${fields.join(", ")}`);
  }
  return result.data;
}
