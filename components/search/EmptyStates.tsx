import Link from "next/link"

import {
  activeFilters,
  nextWiderRadius,
  searchHref,
  type SearchFilters,
} from "@/lib/search/filters"

const listFormat = new Intl.ListFormat("en-US", {
  style: "long",
  type: "conjunction",
})

const RECOVERY_LINK_CLASS =
  "rounded-full border border-ink-primary/20 px-3 py-1.5 text-sm text-ink-primary hover:bg-ink-primary/5"

type NoMatchesProps = {
  filters: SearchFilters
}

/**
 * The filtered dead end: jobs exist, this combination just excludes them all.
 *
 * The copy names the filters actually in force rather than saying "no results
 * found", because a seeker cannot fix a dead end they cannot see the cause
 * of — and with six filters, the cause is rarely the one they last touched.
 * Every named filter is also a link that drops just that filter, so recovery
 * is one click and never means starting the search over.
 *
 * Deliberately unlike PlatformEmpty below: a bordered, left-aligned card of
 * actions. "Your filters are too narrow" and "nobody has posted a job yet"
 * are different facts about the world, and a seeker who confuses the second
 * for the first leaves.
 */
export function NoMatches({ filters }: NoMatchesProps) {
  const active = activeFilters(filters)
  const wider = nextWiderRadius(filters.radiusMiles)

  return (
    <div className="mx-4 my-6 rounded-md border border-ink-primary/15 bg-white p-5 sm:mx-6">
      <h2 className="text-base font-semibold text-ink-primary">
        No jobs match this search
      </h2>

      <p className="mt-2 text-sm text-ink-primary/70">
        {active.length > 0 ? (
          <>
            Nothing within {filters.radiusMiles}{" "}
            {filters.radiusMiles === 1 ? "mile" : "miles"} of a MARTA rail station
            matches {listFormat.format(active.map((filter) => filter.label))}.
          </>
        ) : (
          <>
            No published job is currently within {filters.radiusMiles}{" "}
            {filters.radiusMiles === 1 ? "mile" : "miles"} of a MARTA rail station.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {wider !== null && (
          <Link
            href={searchHref({ ...filters, radiusMiles: wider })}
            className={`${RECOVERY_LINK_CLASS} font-medium`}
          >
            Widen to {wider} {wider === 1 ? "mile" : "miles"}
          </Link>
        )}

        {active.map((filter) => (
          <Link
            key={filter.key}
            href={searchHref(filter.without)}
            className={RECOVERY_LINK_CLASS}
          >
            Remove {filter.label}
          </Link>
        ))}

        {active.length > 1 && (
          <Link href="/search" className={RECOVERY_LINK_CLASS}>
            Clear all filters
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * The platform is empty: no employer has published anything yet.
 *
 * No filter language and no recovery actions, because none would help — the
 * seeker did nothing wrong and there is nothing for them to widen. Centered
 * and dashed where the no-match card is bordered and left-aligned, so the two
 * read as different situations before either is read as words.
 */
export function PlatformEmpty() {
  return (
    <div className="mx-4 my-10 rounded-md border border-dashed border-ink-primary/25 px-6 py-12 text-center sm:mx-6">
      <h2 className="text-base font-semibold text-ink-primary">
        No jobs have been posted yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-primary/70">
        Transit to Work lists roles within walking distance of MARTA rail. As soon as
        employers publish them, they will show up here.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/register" className="underline underline-offset-2">
          Hiring? Post a job
        </Link>
      </p>
    </div>
  )
}
