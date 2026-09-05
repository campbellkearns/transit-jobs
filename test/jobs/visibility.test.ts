import { describe, expect, it } from "vitest"
import { isJobVisibleTo } from "@/lib/jobs/visibility"

describe("isJobVisibleTo", () => {
  it("shows a published job to anyone, including anonymous visitors and other employers", () => {
    const published = { status: "published" as const, employerId: "employer-1" }
    expect(isJobVisibleTo(published, undefined)).toBe(true)
    expect(isJobVisibleTo(published, "employer-2")).toBe(true)
    expect(isJobVisibleTo(published, "employer-1")).toBe(true)
  })

  it("shows a draft job only to its owning employer", () => {
    const draft = { status: "draft" as const, employerId: "employer-1" }
    expect(isJobVisibleTo(draft, "employer-1")).toBe(true)
  })

  it("hides a draft job from every other viewer — the acceptance criterion this feeds", () => {
    const draft = { status: "draft" as const, employerId: "employer-1" }
    expect(isJobVisibleTo(draft, "employer-2")).toBe(false)
    expect(isJobVisibleTo(draft, undefined)).toBe(false)
  })
})
