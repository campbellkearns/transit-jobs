/**
 * Renders a job's salary range for display. Jobs may record a min, a max,
 * both, or neither (`salaryMin`/`salaryMax` are both nullable — spec data
 * model) — this normalizes the four cases into one label or `null` when
 * there's nothing to show.
 */
export function formatSalaryRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null

  const format = (value: number) => `$${value.toLocaleString("en-US")}`

  if (min != null && max != null && min !== max) {
    return `${format(min)}\u2013${format(max)}`
  }

  return format(min ?? (max as number))
}
