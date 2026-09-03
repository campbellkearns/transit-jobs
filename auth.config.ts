import type { NextAuthConfig } from "next-auth"

/**
 * Edge-safe Auth.js config. `middleware.ts` runs on the Edge runtime and
 * only needs to decode the JWT session cookie — it must never import
 * anything that touches Postgres (the Credentials provider's `authorize`,
 * which uses `postgres`/bcryptjs, is Node-only and lives in `auth.ts`).
 *
 * Route gating itself lives in `middleware.ts`, not in an `authorized`
 * callback here: Auth.js's built-in `authorized` hook can only return a
 * boolean and always redirects on `false`, which is wrong for API routes
 * (they need 401/403 JSON, not a redirect to `/login`). `middleware.ts`
 * reads `req.auth` — populated by the jwt/session callbacks below — and
 * decides the response itself.
 */
export const authConfig = {
  // Vercel sets AUTH_TRUST_HOST/VERCEL automatically in deployed
  // environments, but not in local dev or test runs — explicit trustHost
  // keeps action-URL construction (used by the auth() middleware wrapper's
  // internal session lookup) correct everywhere without relying on a
  // canonical AUTH_URL.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id
      if (token.role) session.user.role = token.role
      return session
    },
  },
  session: {
    strategy: "jwt",
  },
} satisfies NextAuthConfig
