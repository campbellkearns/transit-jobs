import { AuthCard } from "@/components/auth/AuthCard"
import { registerAction } from "./actions"

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <AuthCard mode="register" action={registerAction} />
    </main>
  )
}
