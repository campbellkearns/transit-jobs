import type { DefaultSession } from "next-auth"
import type { UserRole } from "@/lib/auth/users"

/**
 * Module augmentation: the Credentials `authorize` callback returns
 * `{ id, email, role }`, and `auth.config.ts`'s jwt/session callbacks carry
 * `role` onto the token and the session user. Declaring these here is what
 * makes `session.user.role` and `token.role` type-check everywhere else
 * instead of silently widening to `any`.
 */
declare module "next-auth" {
  interface User {
    role: UserRole
  }

  interface Session {
    user: {
      id: string
      role: UserRole
    } & DefaultSession["user"]
  }
}

// `next-auth/jwt` just re-exports `@auth/core/jwt` (`export * from "@auth/core/jwt"`),
// so augmenting "next-auth/jwt" doesn't merge into the JWT interface that the
// jwt/session callback signatures in `NextAuthConfig` actually resolve to —
// the real module has to be augmented directly.
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string
    role?: UserRole
  }
}
