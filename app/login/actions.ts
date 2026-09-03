"use server"

import { redirect } from "next/navigation"
import { AuthError } from "next-auth"
import { signIn } from "@/auth"
import type { AuthActionState } from "@/components/auth/AuthCard"

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")

  try {
    await signIn("credentials", { email, password, redirect: false })
  } catch (error) {
    if (error instanceof AuthError) {
      // Same message for "no such user" and "wrong password" — login
      // can't be used to enumerate registered emails.
      return { error: "Incorrect email or password." }
    }
    throw error
  }

  redirect("/")
}
