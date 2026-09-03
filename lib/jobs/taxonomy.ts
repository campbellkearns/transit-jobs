/**
 * The closed vocabularies behind the `jobs.category` and
 * `jobs.experience_level` text columns.
 *
 * They are text in the database rather than enums because adding a category
 * should be a deploy, not a migration — but seeker filters and the employer
 * form have to offer the *same* list or a filter silently matches nothing.
 * This module is that shared list; both sides import it.
 */

export const JOB_CATEGORIES = [
  "Administrative",
  "Customer Service",
  "Food Service",
  "Healthcare",
  "Hospitality",
  "Logistics & Warehouse",
  "Retail",
  "Skilled Trades",
  "Technology",
] as const

export type JobCategory = (typeof JOB_CATEGORIES)[number]

export const EXPERIENCE_LEVELS = [
  "Entry level",
  "Mid level",
  "Senior",
  "Manager",
] as const

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]
