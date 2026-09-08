"use client"

import { Polyline } from "react-leaflet"

import {
  activeLeaderJob,
  leaderLineOptions,
  leaderLinePositions,
} from "@/lib/search/leaderLine"
import type { SearchResult } from "@/lib/search/query"

type LeaderLineOverlayProps = {
  results: SearchResult[]
  activeJobId: string | null
  /**
   * True while the pointer is directly on the active job's pin (solid line)
   * rather than the activation riding in from the rail's sync (dashed line).
   */
  pointerOnActivePin: boolean
}

/**
 * The leader line: the active job's pin connected to its serving station
 * (art_HltyfOl7, locked decision) — thin ink, dashed while idle, solid while
 * the pointer is on the pin, and never always-on: with no active job this
 * renders nothing, which is the deactivation cleanup.
 *
 * Deliberately the only surface this feature touches. It is an isolated
 * overlay so it can be dropped or restyled without touching the A (markers)
 * or B (rail) implementations — deleting this file, its module, and the
 * wiring lines in MapPanel removes the feature entirely.
 *
 * The polyline draws in Leaflet's overlay pane, below the marker pane, and is
 * non-interactive: it cannot catch the pin hover or drag events the sync
 * relies on, and the pins and station badges render on top of it.
 */
export function LeaderLineOverlay({
  results,
  activeJobId,
  pointerOnActivePin,
}: LeaderLineOverlayProps) {
  const positions = leaderLinePositions(activeLeaderJob(results, activeJobId))
  if (!positions) return null

  return (
    <Polyline
      key={pointerOnActivePin ? "active" : "idle"}
      positions={positions}
      pathOptions={leaderLineOptions(pointerOnActivePin ? "active" : "idle")}
      interactive={false}
    />
  )
}
