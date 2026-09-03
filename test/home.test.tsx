import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import HomePage from "../app/page"

describe("HomePage", () => {
  it("renders the marketplace headline and all four MARTA lines", () => {
    render(<HomePage />)

    expect(
      screen.getByRole("heading", { name: /jobs within a mile of marta rail/i })
    ).toBeInTheDocument()

    for (const line of ["BLUE", "GOLD", "GREEN", "RED"]) {
      expect(screen.getByText(line)).toBeInTheDocument()
    }
  })
})
