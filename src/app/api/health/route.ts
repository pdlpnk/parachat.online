import { getDatabase } from "@/server/db";
import { checkReadiness } from "@/server/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkReadiness(() => getDatabase().$queryRaw`SELECT 1`);
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
