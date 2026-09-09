import { cpSync, existsSync } from "node:fs";

// Next's standalone tracer does not copy browser assets automatically.
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
