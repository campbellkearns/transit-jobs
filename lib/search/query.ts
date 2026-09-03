import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { getDb } from "@/db"
import { parsePointEwkbHex, type LngLat } from "@/db/postgis"
import type { MartaLine } from "@/db/schema"

import { METRES_PER_MILE, milesFromMetres, walkMilesFromMetres } from "./distance"
import type { SearchFilters } from "./filters"

/**
 * The seeker's proximity search.
 *
 * Two things about this query are load-bearing, and both come from the spec
 * (art_9CmAgRnh, deliverable 5):
 *
 * 1. Proximity is `ST_DWithin` over the `geography` columns — metres on the
 *    spheroid, exact. The ×1.25 walk figure is derived afterwards for display
 *    and never appears in a predicate.
 * 2. `job_stations.walk_miles` is the employer's *claim*, not a distance. It
 *    is deliberately absent here: geometry is the source of truth, so a job
 *    whose employer named only Peachtree Center still surfaces under a Five
 *    Points search when its pin is nearer Five Points.
 *
 * Which is why the lateral join is against `stations` (all 38) rather than
 * against the employer's `job_stations` rows, as the spec's illustrative SQL
 * sketched. At the default one-mile radius the two produce the same set — a
 * published job is pin-validated within a mile of a station it selected — but
 * joining the full station table is what makes the radius filter mean
 * something above one mile, and what makes the line filter mean "near a BLUE
 * line station" instead of "the employer happened to tick a BLUE station".
 */

const DEFAULT_RESULT_LIMIT = 100

export type SearchResultStation = {
  stopId: string
  name: string
  lines: MartaLine[]
  location: LngLat
}

export type SearchResult = {
  id: string
  title: string
  companyName: string
  category: string
  experienceLevel: string
  salaryMin: number | null
  salaryMax: number | null
  addressText: string
  location: LngLat
  /** Nearest station satisfying the active line filter. */
  station: SearchResultStation
  /** Exact geodesic distance to that station, in miles. */
  miles: number
  /** The "≈" display estimate: geodesic × 1.25, two decimals. */
  walkMiles: number
}

type SearchRow = {
  id: string
  title: string
  category: string
  experience_level: string
  salary_min: number | null
  salary_max: number | null
  address_text: string
  job_location: string
  company_name: string
  station_id: string
  station_name: string
  station_lines: string[]
  station_location: string
  metres: number | string
}

/**
 * Escapes the LIKE metacharacters in user input.
 *
 * Without this a seeker typing "100%" matches every row — `%` is a wildcard,
 * not a literal, and the search would quietly stop filtering rather than
 * fail visibly. Backslash is Postgres's default LIKE escape character.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function buildConditions(filters: SearchFilters): SQL[] {
  // Drafts are invisible to seekers — the state model's hard rule, applied
  // before any user-supplied predicate so no filter combination can lift it.
  const conditions: SQL[] = [sql`j.status = 'published'`]

  const keyword = filters.keyword.trim()
  if (keyword) {
    const pattern = `%${escapeLikePattern(keyword)}%`
    conditions.push(
      sql`(j.title ilike ${pattern} or j.description ilike ${pattern} or c.name ilike ${pattern})`,
    )
  }

  if (filters.category) {
    conditions.push(sql`j.category = ${filters.category}`)
  }

  if (filters.experienceLevel) {
    conditions.push(sql`j.experience_level = ${filters.experienceLevel}`)
  }

  // A salary bound is a question about pay, and a job with no pay recorded
  // cannot answer it. Including unpriced rows here would report them as
  // satisfying a range nobody has checked, so they drop out — visibly, since
  // the no-match copy names the salary filter as one of the ones at work.
  if (filters.salaryMin !== null) {
    conditions.push(sql`coalesce(j.salary_max, j.salary_min) >= ${filters.salaryMin}`)
  }
  if (filters.salaryMax !== null) {
    conditions.push(sql`coalesce(j.salary_min, j.salary_max) <= ${filters.salaryMax}`)
  }

  return conditions
}

/**
 * `s.lines && array['BLUE',...]` — the station serves any of the chosen lines.
 *
 * The array is spelled out element by element rather than bound whole:
 * drizzle's `sql` tag expands a JavaScript array into one placeholder per
 * item, so `${lines}::text[]` reaches Postgres as a bare `'RED'` and fails as
 * a malformed array literal. One parameter per line keeps every value bound.
 */
function lineOverlapCondition(lines: MartaLine[]): SQL | null {
  if (lines.length === 0) return null
  const elements = sql.join(
    lines.map((line) => sql`${line}`),
    sql`, `,
  )
  return sql`s.lines && array[${elements}]::text[]`
}

function toResult(row: SearchRow): SearchResult {
  const metres = Number(row.metres)
  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name,
    category: row.category,
    experienceLevel: row.experience_level,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    addressText: row.address_text,
    location: parsePointEwkbHex(row.job_location),
    station: {
      stopId: row.station_id,
      name: row.station_name,
      lines: row.station_lines as MartaLine[],
      location: parsePointEwkbHex(row.station_location),
    },
    miles: milesFromMetres(metres),
    walkMiles: walkMilesFromMetres(metres),
  }
}

export async function searchJobs(
  filters: SearchFilters,
  { limit = DEFAULT_RESULT_LIMIT }: { limit?: number } = {},
): Promise<SearchResult[]> {
  const db = getDb()
  const radiusMetres = filters.radiusMiles * METRES_PER_MILE
  const lineFilter = lineOverlapCondition(filters.lines)

  const rows = await db.execute<SearchRow>(sql`
    select
      j.id,
      j.title,
      j.category,
      j.experience_level,
      j.salary_min,
      j.salary_max,
      j.address_text,
      j.location as job_location,
      c.name as company_name,
      nearest.stop_id as station_id,
      nearest.name as station_name,
      nearest.lines as station_lines,
      nearest.location as station_location,
      nearest.metres as metres
    from jobs j
    join companies c on c.id = j.company_id
    join lateral (
      select
        s.stop_id,
        s.name,
        s.lines,
        s.location,
        st_distance(j.location, s.location) as metres
      from stations s
      where st_dwithin(j.location, s.location, ${radiusMetres}::double precision)
        ${lineFilter ? sql`and ${lineFilter}` : sql``}
      order by metres asc
      limit 1
    ) nearest on true
    where ${sql.join(buildConditions(filters), sql` and `)}
    order by nearest.metres asc, j.created_at desc, j.id asc
    limit ${limit}
  `)

  return Array.from(rows).map(toResult)
}

/**
 * How many published jobs exist at all, ignoring every filter.
 *
 * This is what separates "your filters matched nothing" from "nothing has been
 * posted yet" — two states the spec requires the UI to tell apart, and the
 * only way to tell them apart is to ask.
 */
export async function countPublishedJobs(): Promise<number> {
  const rows = await getDb().execute<{ total: number | string }>(
    sql`select count(*)::int as total from jobs where status = 'published'`,
  )
  const [row] = Array.from(rows)
  return Number(row?.total ?? 0)
}
