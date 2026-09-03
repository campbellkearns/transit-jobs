import { z } from "zod"

import { MARTA_LINES, type MartaLine } from "@/db/schema"
import { EXPERIENCE_LEVELS, JOB_CATEGORIES } from "@/lib/jobs/taxonomy"

/**
 * The seeker's search state, and its round-trip to the URL.
 *
 * Search state lives in the query string rather than client state: a filtered
 * result set is the thing a seeker sends to a friend, reloads, and comes back
 * to, and the URL is the only container that survives all three. It also means
 * the filter bar can be an ordinary GET form that works with JavaScript off.
 *
 * Imported by client components — this module must stay free of `server-only`
 * and of any database import.
 */

/** Spec art_9CmAgRnh, deliverable 5: the radius defaults to one mile. */
export const DEFAULT_RADIUS_MILES = 1

/**
 * Offered radii. The upper bound is a product decision, not a technical one:
 * past three miles "walk to the train" stops being the claim the platform
 * makes, so widening is recovery from a dead end, not a general distance
 * search.
 */
export const RADIUS_OPTIONS = [0.25, 0.5, 1, 2, 3] as const

export type SearchFilters = {
  keyword: string
  category: string | null
  experienceLevel: string | null
  lines: MartaLine[]
  radiusMiles: number
  salaryMin: number | null
  salaryMax: number | null
}

export const DEFAULT_FILTERS: SearchFilters = {
  keyword: "",
  category: null,
  experienceLevel: null,
  lines: [],
  radiusMiles: DEFAULT_RADIUS_MILES,
  salaryMin: null,
  salaryMax: null,
}

/** Query-string keys, named once so the form inputs and the parser agree. */
export const FILTER_PARAM = {
  keyword: "q",
  category: "category",
  experienceLevel: "experience",
  line: "line",
  radius: "radius",
  salaryMin: "salaryMin",
  salaryMax: "salaryMax",
} as const

/** What Next.js hands a page as `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

const optionalText = (allowed: readonly string[]) =>
  z
    .string()
    .trim()
    .refine((value) => allowed.includes(value))
    .nullable()
    .catch(null)

const optionalSalary = z.coerce
  .number()
  .int()
  .nonnegative()
  .max(10_000_000)
  .nullable()
  .catch(null)

/**
 * Every field falls back to its default instead of throwing. A hand-edited or
 * stale URL is a routine event on a shareable search page, and the honest
 * response is the unfiltered result set, not a 500 — the filter bar then
 * renders the state that was actually applied, so nothing is silently
 * pretended.
 */
const schema = z.object({
  keyword: z.string().trim().max(200).catch(""),
  category: optionalText(JOB_CATEGORIES),
  experienceLevel: optionalText(EXPERIENCE_LEVELS),
  lines: z.array(z.enum(MARTA_LINES)).catch([]),
  radiusMiles: z.coerce
    .number()
    .refine((value): value is number =>
      (RADIUS_OPTIONS as readonly number[]).includes(value),
    )
    .catch(DEFAULT_RADIUS_MILES),
  salaryMin: optionalSalary,
  salaryMax: optionalSalary,
})

export function parseSearchFilters(params: RawSearchParams): SearchFilters {
  const lineValues = all(params[FILTER_PARAM.line])
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is MartaLine =>
      (MARTA_LINES as readonly string[]).includes(value),
    )

  const parsed = schema.parse({
    keyword: first(params[FILTER_PARAM.keyword]) ?? "",
    category: first(params[FILTER_PARAM.category]) || null,
    experienceLevel: first(params[FILTER_PARAM.experienceLevel]) || null,
    lines: Array.from(new Set(lineValues)),
    radiusMiles: first(params[FILTER_PARAM.radius]) ?? DEFAULT_RADIUS_MILES,
    salaryMin: first(params[FILTER_PARAM.salaryMin]) || null,
    salaryMax: first(params[FILTER_PARAM.salaryMax]) || null,
  })

  // An inverted range is a typo, not an intent to match nothing. Swapping is
  // the reading that returns the results the seeker meant.
  if (
    parsed.salaryMin !== null &&
    parsed.salaryMax !== null &&
    parsed.salaryMin > parsed.salaryMax
  ) {
    return { ...parsed, salaryMin: parsed.salaryMax, salaryMax: parsed.salaryMin }
  }

  return parsed
}

/** Serializes filters back to a query string, omitting anything at its default. */
export function toSearchParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.keyword) params.set(FILTER_PARAM.keyword, filters.keyword)
  if (filters.category) params.set(FILTER_PARAM.category, filters.category)
  if (filters.experienceLevel) {
    params.set(FILTER_PARAM.experienceLevel, filters.experienceLevel)
  }
  for (const line of filters.lines) params.append(FILTER_PARAM.line, line)
  if (filters.radiusMiles !== DEFAULT_RADIUS_MILES) {
    params.set(FILTER_PARAM.radius, String(filters.radiusMiles))
  }
  if (filters.salaryMin !== null) {
    params.set(FILTER_PARAM.salaryMin, String(filters.salaryMin))
  }
  if (filters.salaryMax !== null) {
    params.set(FILTER_PARAM.salaryMax, String(filters.salaryMax))
  }
  return params
}

export function searchHref(filters: SearchFilters, pathname = "/search"): string {
  const query = toSearchParams(filters).toString()
  return query ? `${pathname}?${query}` : pathname
}

const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

/**
 * Plain-language names for the filters actually in force.
 *
 * The no-match state has to say which filters produced the dead end (spec
 * art_9CmAgRnh, deliverable 5), so the naming lives beside the parsing rather
 * than being reassembled in the component — one list, one wording.
 */
export function describeActiveFilters(filters: SearchFilters): string[] {
  const described: string[] = []
  if (filters.keyword) described.push(`the keyword “${filters.keyword}”`)
  if (filters.category) described.push(`the ${filters.category} category`)
  if (filters.experienceLevel) {
    described.push(`${filters.experienceLevel} experience`)
  }
  if (filters.lines.length === 1) {
    described.push(`the ${filters.lines[0]} line`)
  } else if (filters.lines.length > 1) {
    described.push(`the ${filters.lines.join(", ")} lines`)
  }
  if (filters.radiusMiles !== DEFAULT_RADIUS_MILES) {
    described.push(`a ${filters.radiusMiles}-mile radius`)
  }
  if (filters.salaryMin !== null && filters.salaryMax !== null) {
    described.push(
      `pay between ${usdWhole.format(filters.salaryMin)} and ${usdWhole.format(filters.salaryMax)}`,
    )
  } else if (filters.salaryMin !== null) {
    described.push(`pay from ${usdWhole.format(filters.salaryMin)}`)
  } else if (filters.salaryMax !== null) {
    described.push(`pay up to ${usdWhole.format(filters.salaryMax)}`)
  }
  return described
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return describeActiveFilters(filters).length > 0
}

/** The next radius a seeker can widen to, or null at the maximum. */
export function nextWiderRadius(radiusMiles: number): number | null {
  return RADIUS_OPTIONS.find((option) => option > radiusMiles) ?? null
}
