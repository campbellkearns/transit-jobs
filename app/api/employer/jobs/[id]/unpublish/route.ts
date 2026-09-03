import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { unpublishJob } from "@/lib/employer/jobs"
import { mapJobErrorToResponse } from "@/lib/employer/http"

type RouteContext = { params: Promise<{ id: string }> }

export const POST = auth(async (req, ctx) => {
  const user = req.auth?.user
  if (!user || user.role !== "employer") {
    return NextResponse.json({ error: "Employer access only." }, { status: 403 })
  }

  const { id } = await (ctx as RouteContext).params

  try {
    const job = await unpublishJob(id, user.id)
    return NextResponse.json({ job })
  } catch (error) {
    const response = mapJobErrorToResponse(error)
    if (response) return response
    throw error
  }
})
