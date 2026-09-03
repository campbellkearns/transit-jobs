"use server"

import { redirect } from "next/navigation"
import { AuthError } from "next-auth"
import { signIn } from "@/auth"
import { DuplicateEmailError, registerUser } from "@/lib/auth/users"
import { registerSchema } from "@/lib/auth/validation"
import type { AuthActionState } from "@/components/auth/AuthCard"

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." }
  }

  try {
    await registerUser(parsed.data)
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return { error: error.message }
    }
    throw error
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      // Account exists; fall back to the login page rather than surfacing
      // an internal sign-in failure right after a successful registration.
      return { error: "Account created — sign in from the login page." }
    }
    throw error
  }

  redirect("/")
}
