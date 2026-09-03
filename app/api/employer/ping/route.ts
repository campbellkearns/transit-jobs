import { NextResponse } from "next/server"
import { auth } from "@/auth"

/**
 * Minimal employer-only endpoint. `middleware.ts` already gates
 * `/api/employer/:path*` at the edge (unauthenticated -> redirect,
 * wrong role -> 403), so reaching this handler at all means the caller is
 * an authenticated employer. The in-handler check is defense in depth —
 * middleware config is a repo-wide surface a future edit could loosen.
 */
export async function GET() {
  const session = await auth()

  if (!session?.user || session.user.role !== "employer") {
    return NextResponse.json({ error: "Employer access only." }, { status: 403 })
  }

  return NextResponse.json({ ok: true, userId: session.user.id })
}
