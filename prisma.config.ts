import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation/validation/build do not need a database connection.
  // migrate deploy requires an explicitly configured DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
