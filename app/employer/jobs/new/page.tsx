import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { auth } from "@/auth"
import { JobForm } from "@/components/employer/JobForm"
import { listStations } from "@/lib/stations"

export const metadata: Metadata = {
  title: "Post a job · Transit to Work",
}

/** New-job form. `middleware.ts` gates `/employer/:path*`; this check is defense in depth. */
export default async function NewEmployerJobPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "employer") {
    redirect("/login")
  }

  const stations = await listStations()

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-sm uppercase tracking-wide text-ink-primary/60">Transit to Work</p>
      <h1 className="mt-1 mb-8 text-2xl font-semibold text-ink-primary">Post a job</h1>
      <JobForm stations={stations} initialJob={null} />
    </main>
  )
}
