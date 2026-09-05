import { z } from "zod"

/**
 * Shared between the Credentials provider's `authorize` (auth.ts), the
 * register API route, and the register server action — one schema per
 * shape so the three entry points into `lib/auth/users.ts` never drift.
 */
export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const registerSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["seeker", "employer"], {
    errorMap: () => ({ message: 'Role must be "seeker" or "employer".' }),
  }),
})
