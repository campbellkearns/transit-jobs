type WalkEstimateProps = {
  miles: number
}

/**
 * "≈ X mi walk" (UI direction component inventory; spec deliverable 7). The
 * ≈ prefix is fixed by spec — it is never omitted, because the figure is a
 * labeled geodesic × 1.25 heuristic, not the exact PostGIS filter distance.
 * `tabular-nums` keeps the figures aligned when several rows stack.
 */
export function WalkEstimate({ miles }: WalkEstimateProps) {
  return (
    <span className="text-sm tabular-nums text-ink-primary/80">
      ≈ {miles.toFixed(2)} mi walk
    </span>
  )
}
