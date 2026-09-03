import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { requireDatabaseUrl } from "./env"
import * as schema from "./schema"

/**
 * Lazily-created Drizzle client. `postgres()` does not open a connection
 * until a query runs, so importing this module is safe even where
 * DATABASE_URL isn't set (e.g. CI's build/typecheck steps, which never
 * touch the database in T1).
 */
function createClient() {
  const queryClient = postgres(requireDatabaseUrl())
  return drizzle(queryClient, { schema })
}

let cached: ReturnType<typeof createClient> | undefined

export function getDb() {
  if (!cached) {
    cached = createClient()
  }
  return cached
}
