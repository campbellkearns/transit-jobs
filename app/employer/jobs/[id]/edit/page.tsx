import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"

import { auth } from "@/auth"
import { JobForm } from "@/components/employer/JobForm"
import { ForbiddenJobAccessError, JobNotFoundError, getEmployerJob } from "@/lib/employer/jobs"
import { listStations } from "@/lib/stations"

export const metadata: Metadata = {
  title: "Edit job · Transit to Work",
}

type EditEmployerJobPageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ notice?: string }>
}

const NOTICE_MESSAGES: Record<string, string> = {
  draft: "Draft saved.",
  published: "Published — visible to seekers now.",
}

/**
 * Edit form for one of the employer's own jobs. Both a missing job and a
 * job owned by a different employer resolve to Next's 404 page here —
 * unlike the API's 403 (spec deliverable 4, verified at the API layer),
 * the browser UI has no reason to confirm to a curious employer that a
 * job id they don't own exists at all.
 */
export default async function EditEmployerJobPage({ params, searchParams }: EditEmployerJobPageProps) {
  const session = await auth()
  if (!session?.user || session.user.role !== "employer") {
    redirect("/login")
  }

  const { id } = await params
  const { notice } = await searchParams
  const initialNotice = notice ? NOTICE_MESSAGES[notice] ?? null : null

  const [job, stations] = await Promise.all([
    getEmployerJob(id, session.user.id).catch((error) => {
      if (error instanceof JobNotFoundError || error instanceof ForbiddenJobAccessError) {
        notFound()
      }
      throw error
    }),
    listStations(),
  ])

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-sm uppercase tracking-wide text-ink-primary/60">Transit to Work</p>
      <h1 className="mt-1 mb-8 text-2xl font-semibold text-ink-primary">Edit job</h1>
      <JobForm stations={stations} initialJob={job} initialNotice={initialNotice} />
    </main>
  )
}
