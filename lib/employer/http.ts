import { NextResponse } from "next/server"
import {
  ForbiddenJobAccessError,
  JobNotFoundError,
  PublishValidationError,
} from "./jobs"

/**
 * Every employer job route hits the same three domain errors. Centralizing
 * the mapping keeps each route handler down to its own logic and means a
 * new failure mode (should one turn up) is added once, not once per route.
 * Returns `null` for anything else so the caller re-throws — an unmapped
 * error should surface, never be swallowed into a generic response.
 */
export function mapJobErrorToResponse(error: unknown): NextResponse | null {
  if (error instanceof JobNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  if (error instanceof ForbiddenJobAccessError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }

  if (error instanceof PublishValidationError) {
    return NextResponse.json({ error: error.message, violations: error.violations }, { status: 422 })
  }

  return null
}
