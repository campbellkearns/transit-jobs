import Link from "next/link"

import type { EmployerJobView } from "@/lib/employer/jobs"
import { formatSalaryRange } from "@/lib/jobs/formatSalary"

/** One row of the employer's own dashboard — status, at a glance, then straight to the form to change it. */
export function EmployerJobRow({ job }: { job: EmployerJobView }) {
  const salaryLabel = formatSalaryRange(job.salaryMin, job.salaryMax)

  return (
    <li className="flex items-center justify-between gap-4 border-b border-ink-primary/10 px-4 py-3 last:border-b-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${job.status === "published" ? "bg-line-green" : "bg-ink-primary/30"}`}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-ink-primary">{job.title}</span>
        </div>
        <p className="text-xs text-ink-primary/60">
          {job.status === "published" ? "Published" : "Draft"} · {job.stations.length}{" "}
          station{job.stations.length === 1 ? "" : "s"}
          {salaryLabel ? ` · ${salaryLabel}` : ""}
        </p>
      </div>

      <Link
        href={`/employer/jobs/${job.id}/edit`}
        className="rounded border border-ink-primary/20 px-3 py-1.5 text-sm text-ink-primary"
      >
        Edit
      </Link>
    </li>
  )
}
