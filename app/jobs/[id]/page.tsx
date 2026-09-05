import { notFound } from "next/navigation"
import { z } from "zod"
import { auth } from "@/auth"
import { getJobDetail } from "@/lib/jobs/getJobDetail"
import { JobDetailView } from "@/components/jobs/JobDetailView"

const jobIdSchema = z.string().uuid()

type JobDetailPageProps = {
  params: Promise<{ id: string }>
}

/**
 * Job detail (spec deliverable 7). Draft jobs 404 to everyone except their
 * owning employer — `getJobDetail` returns `null` for both "doesn't exist"
 * and "exists but you can't see it," so both paths land on the same
 * `notFound()` here.
 */
export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params
  const parsedId = jobIdSchema.safeParse(id)
  if (!parsedId.success) {
    notFound()
  }

  const session = await auth()
  const job = await getJobDetail(parsedId.data, session?.user?.id)

  if (!job) {
    notFound()
  }

  return <JobDetailView job={job} />
}
