/** The installed Prisma PG adapter normalizes timestamptz offsets as UTC.
 * Force the PostgreSQL session to UTC so returned wall-clock values are UTC too.
 * Append after any existing options; never change the database/server timezone.
 */
export function utcDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("options", `${url.searchParams.get("options") ?? ""} -c timezone=UTC`.trim());
  return url.toString();
}
