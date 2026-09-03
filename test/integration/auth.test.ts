// @vitest-environment node
/**
 * Integration tests against the real route handlers and a real Postgres
 * database (DATABASE_URL, provisioned in CI by .circleci/config.yml).
 * Route handlers in the App Router are plain `(Request) => Response`
 * functions, so they're invoked directly here — no dev server required.
 */
import { randomUUID } from "crypto"
import { NextRequest, NextFetchEvent, type NextMiddleware } from "next/server"
import { describe, expect, it } from "vitest"
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...nextauth]/route"
import { POST as registerRoute } from "@/app/api/register/route"
import middlewareImpl from "@/middleware"

// next-auth's `auth()` helper type is an intersection of five call
// signatures (API routes, RSC, getServerSideProps, App Router route
// handlers, and middleware) that all structurally accept a one-argument
// callback, so a plain `tsc` run (no Next.js TS plugin, which only runs in
// editors) resolves `auth((req) => ...)` to the route-handler overload
// instead of the middleware one. The runtime behavior is unaffected —
// Next.js's edge runtime always calls middleware as (req, event) — so the
// test asserts the type we know it actually is.
const middleware = middlewareImpl as unknown as NextMiddleware

const BASE_URL = "http://localhost:3000"

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.test`
}

async function register(email: string, password: string, role: "seeker" | "employer") {
  return registerRoute(
    new NextRequest(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    })
  )
}

/** Cookie jar helper: extracts `name=value` pairs from Set-Cookie headers. */
function extractCookies(response: Response): Record<string, string> {
  const jar: Record<string, string> = {}
  for (const setCookie of response.headers.getSetCookie()) {
    const pair = setCookie.split(";")[0] ?? ""
    const [name, ...rest] = pair.split("=")
    if (name) jar[name.trim()] = rest.join("=")
  }
  return jar
}

function cookieHeader(jar: Record<string, string>) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")
}

/**
 * A real deployment's edge network (Vercel, any reverse proxy) always sets
 * `x-forwarded-*` before invoking middleware; next-auth's `auth()` wrapper
 * relies on them to build its internal session-lookup URL. Bare requests
 * built by hand in a test don't get these for free, so every middleware
 * invocation here goes through this constructor.
 *
 * The second argument the `NextMiddleware` type requires, `NextFetchEvent`,
 * isn't used by this app's middleware body and isn't constructible from
 * userland code anyway (`next/server` only exports its *type*, not the
 * class) — this stands in for it rather than pretending to build a real one.
 */
async function callMiddleware(path: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(`${BASE_URL}${path}`, {
    headers: {
      Cookie: cookieHeader(cookies),
      "x-forwarded-proto": "http",
      "x-forwarded-host": "localhost:3000",
    },
  })
  const event = undefined as unknown as NextFetchEvent
  return middleware(request, event)
}

/** Full Credentials sign-in flow: CSRF, then callback/credentials. */
async function signIn(email: string, password: string) {
  const csrfResponse = await authGet(new NextRequest(`${BASE_URL}/api/auth/csrf`))
  const csrfCookies = extractCookies(csrfResponse)
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string }

  const loginResponse = await authPost(
    new NextRequest(`${BASE_URL}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader(csrfCookies),
      },
      body: new URLSearchParams({
        email,
        password,
        csrfToken,
        redirect: "false",
        json: "true",
      }),
    })
  )

  const sessionCookies = extractCookies(loginResponse)
  return { response: loginResponse, cookies: { ...csrfCookies, ...sessionCookies } }
}

describe("auth: register", () => {
  it("registers a seeker and never returns the password hash", async () => {
    const email = uniqueEmail("seeker-register")
    const response = await register(email, "correct-password-1", "seeker")
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.user).toMatchObject({ email, role: "seeker" })
    expect(body.user.passwordHash).toBeUndefined()
    expect(JSON.stringify(body)).not.toMatch(/\$2[aby]\$/) // no bcrypt hash leaked
  })

  it("registers an employer", async () => {
    const email = uniqueEmail("employer-register")
    const response = await register(email, "correct-password-1", "employer")
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.user).toMatchObject({ email, role: "employer" })
  })

  it("rejects a duplicate email with a clear error", async () => {
    const email = uniqueEmail("dup")
    const first = await register(email, "correct-password-1", "seeker")
    expect(first.status).toBe(201)

    const second = await register(email, "another-password-1", "seeker")
    const body = await second.json()

    expect(second.status).toBe(409)
    expect(body.error).toMatch(/already exists/i)
  })

  it("rejects a short password with a clear error", async () => {
    const response = await register(uniqueEmail("short-pw"), "short", "seeker")
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/8 characters/i)
  })
})

describe("auth: login", () => {
  it("logs in a registered user and issues a session cookie", async () => {
    const email = uniqueEmail("login-ok")
    const password = "correct-password-1"
    await register(email, password, "seeker")

    const { cookies } = await signIn(email, password)

    expect(cookies["authjs.session-token"] ?? cookies["__Secure-authjs.session-token"]).toBeTruthy()
  })

  it("rejects a wrong password with no session cookie issued", async () => {
    const email = uniqueEmail("login-wrong-pw")
    await register(email, "correct-password-1", "seeker")

    const { cookies } = await signIn(email, "totally-wrong-password")

    expect(cookies["authjs.session-token"]).toBeUndefined()
  })

  it("rejects an unknown email with no session cookie issued", async () => {
    const { cookies } = await signIn(uniqueEmail("never-registered"), "whatever-password")

    expect(cookies["authjs.session-token"]).toBeUndefined()
  })
})

describe("auth: logout", () => {
  it("clears the session cookie on sign-out", async () => {
    const email = uniqueEmail("logout")
    const password = "correct-password-1"
    await register(email, password, "seeker")
    const { cookies } = await signIn(email, password)

    const csrfResponse = await authGet(
      new NextRequest(`${BASE_URL}/api/auth/csrf`, { headers: { Cookie: cookieHeader(cookies) } })
    )
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string }
    const csrfCookies = extractCookies(csrfResponse)

    const signOutResponse = await authPost(
      new NextRequest(`${BASE_URL}/api/auth/signout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieHeader({ ...cookies, ...csrfCookies }),
        },
        body: new URLSearchParams({ csrfToken, json: "true" }),
      })
    )

    const cleared = signOutResponse.headers
      .getSetCookie()
      .find((header) => header.startsWith("authjs.session-token="))

    expect(cleared).toBeTruthy()
    expect(cleared).toMatch(/(Max-Age=0|Expires=Thu, 01 Jan 1970)/)
  })
})

describe("auth: role authorization", () => {
  it("lets an employer reach the employer-only route (middleware passes it through)", async () => {
    const email = uniqueEmail("employer-authz")
    const password = "correct-password-1"
    await register(email, password, "employer")
    const { cookies } = await signIn(email, password)

    // middleware.ts runs the request through Auth.js's Edge session decode
    // before it would ever reach app/api/employer/ping/route.ts in the real
    // app — this is the enforcement point for "employer routes reject
    // seekers", so it's what the test exercises directly.
    const middlewareResponse = await callMiddleware("/api/employer/ping", cookies)

    // NextResponse.next() is a passthrough marker, not a rejection —
    // 401/403 are the only outcomes middleware.ts uses to block a request.
    expect(middlewareResponse?.status).not.toBe(401)
    expect(middlewareResponse?.status).not.toBe(403)
  })

  it("rejects a seeker at the employer-only route with 403", async () => {
    const email = uniqueEmail("seeker-authz")
    const password = "correct-password-1"
    await register(email, password, "seeker")
    const { cookies } = await signIn(email, password)

    const middlewareResponse = await callMiddleware("/api/employer/ping", cookies)

    expect(middlewareResponse?.status).toBe(403)
  })

  it("rejects an unauthenticated request with 401", async () => {
    const middlewareResponse = await callMiddleware("/api/employer/ping")

    expect(middlewareResponse?.status).toBe(401)
  })
})
