import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { authConfig } from "./auth.config"
import { verifyCredentials } from "@/lib/auth/users"
import { credentialsSchema } from "@/lib/auth/validation"

/**
 * Full server config — Node-only. The Credentials provider's `authorize`
 * touches Postgres via `verifyCredentials`, so this module (and anything
 * that imports it) must never be pulled into `middleware.ts`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials)
        if (!parsed.success) {
          return null
        }
        const user = await verifyCredentials(parsed.data.email, parsed.data.password)
        if (!user) {
          return null
        }
        return user
      },
    }),
  ],
})
