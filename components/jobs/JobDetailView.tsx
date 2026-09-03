import type { JobDetail } from "@/lib/jobs/getJobDetail"
import { formatSalaryRange } from "@/lib/jobs/formatSalary"
import { JobRow } from "./JobRow"
import { StationChip } from "./StationChip"
import { WalkEstimate } from "./WalkEstimate"

/**
 * The job detail page's presentation, split out from `app/jobs/[id]/page.tsx`
 * so it can render from a plain fixture in tests — no database, no auth,
 * no Server Component boundary (mirrors `app/page.tsx` / `test/home.test.tsx`).
 */
export function JobDetailView({ job }: { job: JobDetail }) {
  const salaryLabel = formatSalaryRange(job.salaryMin, job.salaryMax)

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      {job.status === "draft" && (
        <p className="rounded-md border border-ink-primary/10 bg-gray-50 px-4 py-2 text-sm text-ink-primary/80">
          Draft — visible only to you until published.
        </p>
      )}

      <JobRow
        size="reading"
        title={job.title}
        companyName={job.company.name}
        salaryLabel={salaryLabel}
        stations={job.stations}
      />

      <section aria-labelledby="job-description-heading" className="flex flex-col gap-3">
        <h2
          id="job-description-heading"
          className="text-sm font-medium uppercase tracking-wide text-ink-primary/60"
        >
          About the role
        </h2>
        <p className="whitespace-pre-line text-base text-ink-primary/90">{job.description}</p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-primary/70">
          <div className="flex gap-1">
            <dt className="font-medium">Category</dt>
            <dd>{job.category}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-medium">Experience</dt>
            <dd>{job.experienceLevel}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="job-company-heading" className="flex flex-col gap-2">
        <h2
          id="job-company-heading"
          className="text-sm font-medium uppercase tracking-wide text-ink-primary/60"
        >
          Company
        </h2>
        <p className="text-base font-medium text-ink-primary">{job.company.name}</p>
        {job.company.description && (
          <p className="text-base text-ink-primary/80">{job.company.description}</p>
        )}
        {job.company.websiteUrl && (
          <a
            href={job.company.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-ink-primary underline"
          >
            {job.company.websiteUrl}
          </a>
        )}
        <p className="text-sm text-ink-primary/70">{job.addressText}</p>
      </section>

      <section aria-labelledby="job-stations-heading" className="flex flex-col gap-2">
        <h2
          id="job-stations-heading"
          className="text-sm font-medium uppercase tracking-wide text-ink-primary/60"
        >
          Nearest station{job.stations.length === 1 ? "" : "s"}
        </h2>
        {job.stations.length > 0 ? (
          <ul className="flex flex-col">
            {job.stations.map((station) => (
              <li
                key={station.stopId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-primary/10 py-2 last:border-b-0"
              >
                <StationChip name={station.name} lines={station.lines} />
                <WalkEstimate miles={station.walkMiles} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-primary/60">No station on record yet.</p>
        )}
      </section>

      {job.applyUrl && (
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded bg-ink-primary px-4 py-2 text-sm font-medium text-white"
        >
          Apply ↗
        </a>
      )}
    </main>
  )
}
