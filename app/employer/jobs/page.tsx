import Link from "next/link"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { auth } from "@/auth"
import { EmployerJobRow } from "@/components/employer/EmployerJobRow"
import { listEmployerJobs } from "@/lib/employer/jobs"

export const metadata: Metadata = {
  title: "Your postings · Transit to Work",
}

/**
 * The employer dashboard. `middleware.ts` already gates `/employer/:path*`
 * (unauthenticated -> `/login`, wrong role -> `/`) — the check here is
 * defense in depth, same rationale as `app/api/employer/ping/route.ts`.
 */
export default async function EmployerJobsPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "employer") {
    redirect("/login")
  }

  const jobs = await listEmployerJobs(session.user.id)

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-ink-primary/60">Transit to Work</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-primary">Your postings</h1>
        </div>
        <Link
          href="/employer/jobs/new"
          className="rounded-md bg-ink-primary px-4 py-2.5 text-sm font-medium text-white"
        >
          Post a job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <p className="mt-10 rounded border border-ink-primary/10 px-4 py-8 text-center text-sm text-ink-primary/70">
          You haven&rsquo;t posted any jobs yet.{" "}
          <Link href="/employer/jobs/new" className="underline underline-offset-2">
            Post your first job
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 rounded border border-ink-primary/10">
          {jobs.map((job) => (
            <EmployerJobRow key={job.id} job={job} />
          ))}
        </ul>
      )}
    </main>
  )
}
