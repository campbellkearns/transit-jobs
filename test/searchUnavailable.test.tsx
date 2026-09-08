import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SearchUnavailable } from "@/components/search/EmptyStates"

describe("SearchUnavailable", () => {
  it("names the outage and offers a retry, with no filter language", () => {
    render(<SearchUnavailable />)

    expect(
      screen.getByRole("heading", { name: "Search is unavailable right now" }),
    ).toBeInTheDocument()
    expect(screen.getByText(/could not load jobs/i)).toBeInTheDocument()

    const retry = screen.getByRole("link", { name: "Try again" })
    expect(retry).toHaveAttribute("href", "/search")
  })
})
