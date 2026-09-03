import "server-only"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { getDb } from "@/db"
import { users, type userRole } from "@/db/schema"

const BCRYPT_ROUNDS = 12

export type UserRole = (typeof userRole.enumValues)[number]

/** Shape returned to callers — the password hash never leaves this module. */
export type PublicUser = {
  id: string
  email: string
  role: UserRole
}

function toPublicUser(row: { id: string; email: string; role: UserRole }): PublicUser {
  return { id: row.id, email: row.email, role: row.role }
}

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An account with email "${email}" already exists.`)
    this.name = "DuplicateEmailError"
  }
}

/** Registers a new user. Throws `DuplicateEmailError` if the email is taken. */
export async function registerUser(input: {
  email: string
  password: string
  role: UserRole
}): Promise<PublicUser> {
  const db = getDb()
  const email = input.email.trim().toLowerCase()

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existing) {
    throw new DuplicateEmailError(email)
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  const [created] = await db
    .insert(users)
    .values({ email, passwordHash, role: input.role })
    .returning({ id: users.id, email: users.email, role: users.role })

  if (!created) {
    throw new Error("Insert returned no row")
  }

  return toPublicUser(created)
}

/**
 * Verifies email/password against stored bcrypt hashes. Returns the public
 * user on success, `null` on any mismatch (unknown email or wrong password —
 * both look identical to the caller so login can't be used to enumerate
 * registered emails).
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const db = getDb()
  const normalizedEmail = email.trim().toLowerCase()

  const existing = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  })
  if (!existing) {
    return null
  }

  const passwordMatches = await bcrypt.compare(password, existing.passwordHash)
  if (!passwordMatches) {
    return null
  }

  return toPublicUser(existing)
}
