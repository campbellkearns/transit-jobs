const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

/**
 * The pay line for a job, or `null` when the employer recorded none.
 *
 * `null` rather than a placeholder string: "unpriced" and "$0" are different
 * facts, and only the caller knows how its surface should say the first one.
 * Both bounds are optional in the schema, so all four shapes are real.
 */
export function formatSalaryRange(
  salaryMin: number | null,
  salaryMax: number | null,
): string | null {
  if (salaryMin !== null && salaryMax !== null) {
    return salaryMin === salaryMax
      ? usdWhole.format(salaryMin)
      : `${usdWhole.format(salaryMin)} – ${usdWhole.format(salaryMax)}`
  }
  if (salaryMin !== null) return `From ${usdWhole.format(salaryMin)}`
  if (salaryMax !== null) return `Up to ${usdWhole.format(salaryMax)}`
  return null
}
