import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "@/db/schema"

/**
 * Database-backed tests run against a real PostGIS instance — the behaviour
 * under test (geography round-trips, ON CONFLICT, foreign-key restriction,
 * check constraints) exists only in the database, so a mock would assert
 * nothing.
 *
 * CI provides one and is required to run them. Locally they skip when
 * DATABASE_URL is unset, so `npm test` still works without Postgres installed;
 * the `CI` guard below stops that convenience from silently disarming the gate
 * on the build that matters.
 */
const url = process.env.DATABASE_URL

if (process.env.CI && !url) {
  throw new Error("DATABASE_URL must be set in CI — database tests must not silently skip")
}

export const hasDatabase = Boolean(url)

export function connect() {
  if (!url) throw new Error("DATABASE_URL is not set")
  const client = postgres(url, { max: 1 })
  return { client, db: drizzle(client, { schema }) }
}

/**
 * Runs a query expected to violate a constraint and returns the constraint's
 * name.
 *
 * Drizzle wraps driver errors, so `error.message` is only ever "Failed query:
 * …" and a regex over it would pass for any failure at all — including the
 * query being malformed. The driver's `constraint_name` is on the cause, and
 * naming it exactly is what makes these assertions mean something.
 */
export async function violatedConstraint(operation: PromiseLike<unknown>): Promise<string> {
  try {
    await operation
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error
    const name = (cause as { constraint_name?: string }).constraint_name
    if (typeof name === "string" && name.length > 0) return name
    throw error
  }
  throw new Error("Expected the query to violate a constraint, but it succeeded")
}
