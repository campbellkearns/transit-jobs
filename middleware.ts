import { NextResponse } from "next/server"
import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

/**
 * Edge middleware. Built from `authConfig` alone (no Credentials provider,
 * no DB import) so it stays Edge-runtime compatible — it only decodes the
 * JWT session cookie via `req.auth`.
 */
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isEmployerOnly =
    pathname.startsWith("/api/employer") || pathname.startsWith("/employer")

  if (!isEmployerOnly) {
    return NextResponse.next()
  }

  const isApiRoute = pathname.startsWith("/api/")
  const user = req.auth?.user

  if (!user) {
    return isApiRoute
      ? NextResponse.json({ error: "Authentication required." }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url))
  }

  if (user.role !== "employer") {
    return isApiRoute
      ? NextResponse.json({ error: "Employer access only." }, { status: 403 })
      : NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/employer/:path*", "/api/employer/:path*"],
}
