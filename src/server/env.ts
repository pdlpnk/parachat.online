import "server-only";
import { parseServerEnv, type ServerEnv } from "./env-schema";

let cached: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  return cached ??= parseServerEnv(process.env);
}
