import "server-only"
import { eq } from "drizzle-orm"
import { getDb } from "@/db"
import { companies } from "@/db/schema"

/**
 * One company per employer for the MVP. There is no company-profile
 * management surface in this deliverable, so the first job an employer
 * creates silently provisions a default company record — naming/editing
 * that profile is a follow-up, not part of T4's job CRUD scope.
 */
export async function getOrCreateCompany(employerId: string) {
  const db = getDb()

  const existing = await db.query.companies.findFirst({ where: eq(companies.ownerId, employerId) })
  if (existing) return existing

  const [created] = await db
    .insert(companies)
    .values({ ownerId: employerId, name: "New company — update your profile" })
    .returning()

  if (!created) {
    throw new Error("Insert returned no row")
  }

  return created
}
