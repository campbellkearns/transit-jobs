/**
 * Drizzle schema. `users` lands here (T3, auth) because Credentials
 * login/registration needs it immediately; the remaining tables (jobs,
 * stations, job_stations, companies, etc.) land in T2 (schema & station
 * seed) — this file is additive from here on, not a place to redefine
 * `users`.
 */
import { pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core"

export const userRole = pgEnum("user_role", ["seeker", "employer"])

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // bcrypt
  role: userRole("role").notNull(),
})
