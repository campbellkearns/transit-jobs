import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { createDraftJob, listEmployerJobs } from "@/lib/employer/jobs"
import { jobInputSchema } from "@/lib/employer/validation"

/**
 * Wrapped in `auth()` — the Route Handler form (`auth((req) => ...)`), not
 * the bare `await auth()` React-Server-Components form `app/api/employer/ping`
 * uses — because this form decodes the session straight from the request's
 * cookies (same as `middleware.ts`), so it works when a test calls the
 * exported handler directly. A bare `await auth()` call throws outside a
 * real Next.js request dispatch ("headers was called outside a request
 * scope"), which would make this handler untestable without a live server.
 *
 * `middleware.ts` already gates `/api/employer/:path*` (401 unauthenticated,
 * 403 wrong role); the check below is defense in depth, matching the
 * existing `ping` route's rationale.
 */
export const GET = auth(async (req) => {
  const user = req.auth?.user
  if (!user || user.role !== "employer") {
    return NextResponse.json({ error: "Employer access only." }, { status: 403 })
  }

  const jobs = await listEmployerJobs(user.id)
  return NextResponse.json({ jobs })
})

export const POST = auth(async (req) => {
  const user = req.auth?.user
  if (!user || user.role !== "employer") {
    return NextResponse.json({ error: "Employer access only." }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = jobInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid job payload." },
      { status: 400 },
    )
  }

  const id = await createDraftJob(user.id, parsed.data)
  return NextResponse.json({ id }, { status: 201 })
})
