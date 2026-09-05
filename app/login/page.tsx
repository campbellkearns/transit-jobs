import { AuthCard } from "@/components/auth/AuthCard"
import { loginAction } from "./actions"

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <AuthCard mode="login" action={loginAction} />
    </main>
  )
}
