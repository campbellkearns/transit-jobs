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
 * One filter that is actually in force: what to call it, and the filter set
 * that remains once it is dropped.
 */
export type ActiveFilter = {
  /** Stable identity for React keys. */
  key: string
  /** Plain-language name, e.g. “the GREEN line”. */
  label: string
  /** The same search with this one filter removed. */
  without: SearchFilters
}

/**
 * The filters actually in force, each with the search that drops it.
 *
 * The no-match state has to name the filters that produced the dead end and
 * offer a way out of it (spec art_9CmAgRnh, deliverable 5). Naming and
 * removal are the same list because they have to stay in step: a component
 * that wrote its own copy would eventually describe a filter it cannot
 * actually clear.
 */
export function activeFilters(filters: SearchFilters): ActiveFilter[] {
  const active: ActiveFilter[] = []
  const drop = (patch: Partial<SearchFilters>): SearchFilters => ({
    ...filters,
    ...patch,
  })

  if (filters.keyword) {
    active.push({
      key: "keyword",
      label: `the keyword “${filters.keyword}”`,
      without: drop({ keyword: "" }),
    })
  }
  if (filters.category) {
    active.push({
      key: "category",
      label: `the ${filters.category} category`,
      without: drop({ category: null }),
    })
  }
  if (filters.experienceLevel) {
    active.push({
      key: "experience",
      label: `${filters.experienceLevel} experience`,
      without: drop({ experienceLevel: null }),
    })
  }
  if (filters.lines.length > 0) {
    active.push({
      key: "lines",
      label:
        filters.lines.length === 1
          ? `the ${filters.lines[0]} line`
          : `the ${filters.lines.join(", ")} lines`,
      without: drop({ lines: [] }),
    })
  }
  if (filters.radiusMiles !== DEFAULT_RADIUS_MILES) {
    active.push({
      key: "radius",
      label: `a ${filters.radiusMiles}-mile radius`,
      without: drop({ radiusMiles: DEFAULT_RADIUS_MILES }),
    })
  }
  if (filters.salaryMin !== null || filters.salaryMax !== null) {
    active.push({
      key: "salary",
      label: describeSalary(filters.salaryMin, filters.salaryMax),
      without: drop({ salaryMin: null, salaryMax: null }),
    })
  }

  return active
}

function describeSalary(min: number | null, max: number | null): string {
  if (min !== null && max !== null) {
    return `pay between ${usdWhole.format(min)} and ${usdWhole.format(max)}`
  }
  if (min !== null) return `pay from ${usdWhole.format(min)}`
  return `pay up to ${usdWhole.format(max ?? 0)}`
}

/** Plain-language names for the filters actually in force. */
export function describeActiveFilters(filters: SearchFilters): string[] {
  return activeFilters(filters).map((filter) => filter.label)
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return activeFilters(filters).length > 0
}

/** The next radius a seeker can widen to, or null at the maximum. */
export function nextWiderRadius(radiusMiles: number): number | null {
  return RADIUS_OPTIONS.find((option) => option > radiusMiles) ?? null
}
