import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { utcDatabaseUrl } from "./database-config";
import { getServerEnv } from "./env";

const globalDb = globalThis as unknown as { linaDb?: PrismaClient };

export function getDatabase(): PrismaClient {
  if (!globalDb.linaDb) {
    const adapter = new PrismaPg({
      connectionString: utcDatabaseUrl(getServerEnv().DATABASE_URL),
      max: 5,
      connectionTimeoutMillis: 2_000,
      query_timeout: 2_000,
      statement_timeout: 2_000,
      idleTimeoutMillis: 30_000,
    });
    globalDb.linaDb = new PrismaClient({ adapter });
  }
  return globalDb.linaDb;
}
