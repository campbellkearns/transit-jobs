/**
 * Reads the database URL for scripts that cannot run without one, failing
 * loudly rather than letting a connection attempt fail later with a driver
 * error that does not name the missing variable.
 */
export function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at a PostGIS database.",
    )
  }
  return connectionString
}
