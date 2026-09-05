import { NextResponse } from "next/server"
import { DuplicateEmailError, registerUser } from "@/lib/auth/users"
import { registerSchema } from "@/lib/auth/validation"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid registration payload." },
      { status: 400 }
    )
  }

  try {
    const user = await registerUser(parsed.data)
    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}
