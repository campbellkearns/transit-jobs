import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { assertJobOwnedByEmployer, getEmployerJob, updateJob } from "@/lib/employer/jobs"
import { mapJobErrorToResponse } from "@/lib/employer/http"
import { jobInputSchema } from "@/lib/employer/validation"

type RouteContext = { params: Promise<{ id: string }> }

export const GET = auth(async (req, ctx) => {
  const user = req.auth?.user
  if (!user || user.role !== "employer") {
    return NextResponse.json({ error: "Employer access only." }, { status: 403 })
  }

  const { id } = await (ctx as RouteContext).params

  try {
    const job = await getEmployerJob(id, user.id)
    return NextResponse.json({ job })
  } catch (error) {
    const response = mapJobErrorToResponse(error)
    if (response) return response
    throw error
  }
})

export const PATCH = auth(async (req, ctx) => {
  const user = req.auth?.user
  if (!user || user.role !== "employer") {
    return NextResponse.json({ error: "Employer access only." }, { status: 403 })
  }

  const { id } = await (ctx as RouteContext).params

  // Ownership is checked before the body is even parsed: a non-owner's edit
  // must return 403 regardless of whether their payload happens to be
  // well-formed, not a 400 that validates content they can't touch.
  try {
    await assertJobOwnedByEmployer(id, user.id)
  } catch (error) {
    const response = mapJobErrorToResponse(error)
    if (response) return response
    throw error
  }

  const body = await req.json().catch(() => null)
  const parsed = jobInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid job payload." },
      { status: 400 },
    )
  }

  try {
    const job = await updateJob(id, user.id, parsed.data)
    return NextResponse.json({ job })
  } catch (error) {
    const response = mapJobErrorToResponse(error)
    if (response) return response
    throw error
  }
})
