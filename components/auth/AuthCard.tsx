"use client"

import { useActionState } from "react"
import type { UserRole } from "@/lib/auth/users"

export type AuthActionState = { error?: string }

type AuthCardProps = {
  mode: "login" | "register"
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: "seeker", label: "Job seeker" },
  { value: "employer", label: "Employer" },
]

/**
 * Minimal ink-on-paper auth form (UI direction art_cJdHuq28): ink-primary
 * actions, hairline borders, no brand chrome or accent hue. Shared shape
 * for both login and register — the two differ only in submit copy and
 * the role picker.
 */
export function AuthCard({ mode, action }: AuthCardProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const isRegister = mode === "register"

  return (
    <div className="w-full max-w-sm rounded-md border border-ink-primary/10 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-ink-primary">
        {isRegister ? "Create your account" : "Sign in"}
      </h1>

      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded border border-ink-primary/10 px-3 py-2 text-base text-ink-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="rounded border border-ink-primary/10 px-3 py-2 text-base text-ink-primary"
          />
        </label>

        {isRegister && (
          <fieldset className="flex flex-col gap-2 text-sm text-ink-primary">
            <legend className="mb-1">I am a</legend>
            {ROLES.map((role) => (
              <label key={role.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value={role.value}
                  defaultChecked={role.value === "seeker"}
                />
                {role.label}
              </label>
            ))}
          </fieldset>
        )}

        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-ink-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  )
}
