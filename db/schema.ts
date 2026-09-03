import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { geographyPoint, pointConstraint } from "./postgis"

export const userRole = pgEnum("user_role", ["seeker", "employer"])
export const jobStatus = pgEnum("job_status", ["draft", "published"])

/**
 * `users` originates in T3 (auth); its columns and semantics are unchanged
 * here. The one addition is the uniqueness index: `lib/auth/users.ts`
 * lowercases every address before both insert and lookup, so enforcing
 * uniqueness on `lower(email)` states that same guarantee in the database,
 * and it keeps holding for any future writer that forgets to normalize. A
 * plain unique column would still admit `A@b.com` beside `a@b.com`.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(), // bcrypt
    role: userRole("role").notNull(),
  },
  (table) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${table.email})`)],
)

/**
 * The four MARTA rail lines, as `route_short_name` appears in the GTFS feed.
 * Station lines are stored as a text array rather than an enum array: the set
 * is stable today but a new line is a data change, not a migration.
 */
export const MARTA_LINES = ["BLUE", "GOLD", "GREEN", "RED"] as const
export type MartaLine = (typeof MARTA_LINES)[number]

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  websiteUrl: text("website_url"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * The 38 MARTA rail stations, seeded once from the pinned GTFS feed.
 *
 * Keyed on GTFS `stop_id`, never on name: MARTA renames stations (GWCC/CNN
 * Center became "SEC District Station" in December 2025) while ids hold, so a
 * name key would orphan every job association on the next rebrand.
 */
export const stations = pgTable(
  "stations",
  {
    stopId: text("stop_id").primaryKey(),
    name: text("name").notNull(),
    lines: text("lines").array().notNull(),
    location: geographyPoint("location").notNull(),
  },
  (table) => [
    index("stations_location_idx").using("gist", table.location),
    check("stations_location_is_wgs84_point", pointConstraint(table.location)),
  ],
)

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    experienceLevel: text("experience_level").notNull(),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    // Typed by the employer and shown to seekers; the pin below is the
    // coordinate of record, because the MVP does no geocoding.
    addressText: text("address_text").notNull(),
    location: geographyPoint("location").notNull(),
    applyUrl: text("apply_url"),
    status: jobStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("jobs_location_idx").using("gist", table.location),
    index("jobs_status_idx").on(table.status),
    index("jobs_employer_idx").on(table.employerId),
    check("jobs_location_is_wgs84_point", pointConstraint(table.location)),
  ],
)

/**
 * Employer-declared association between a job and a station.
 *
 * `walkMiles` is the employer's own claim, capped at 1.00 and validated
 * server-side against the pin before publish (T4). It is never the search
 * filter — seeker proximity is always exact `ST_DWithin` over the geography
 * columns, and the UI's "≈ walk" figure is computed geodesically at read time.
 * The composite primary key makes a duplicated association impossible.
 */
export const jobStations = pgTable(
  "job_stations",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    stationId: text("station_id")
      .notNull()
      .references(() => stations.stopId, { onDelete: "restrict" }),
    walkMiles: numeric("walk_miles", { precision: 3, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.stationId] }),
    index("job_stations_station_idx").on(table.stationId),
    // The platform's promise, enforced in the database rather than trusted
    // from the form. T4 additionally validates the claim against the pin.
    check(
      "job_stations_walk_miles_within_one",
      sql`${table.walkMiles} > 0 and ${table.walkMiles} <= 1.00`,
    ),
  ],
)
