import postgres from "postgres"

/**
 * Enables the Postgres extensions the schema depends on.
 *
 * This must run *before* `drizzle-kit push`: `stations.location` and
 * `jobs.location` are declared `geography(Point,4326)`, and that type does not
 * exist until PostGIS is installed, so a push against a bare database fails on
 * the first CREATE TABLE. Hence `npm run db:setup` = extensions, then push.
 */
export async function enableExtensions(connectionString: string): Promise<void> {
  // `IF NOT EXISTS` raises a NOTICE on an already-installed extension; the
  // driver would otherwise print it as if something had gone wrong.
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} })
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS postgis`
  } finally {
    await sql.end()
  }
}
