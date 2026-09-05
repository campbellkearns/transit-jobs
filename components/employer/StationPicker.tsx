"use client"

import { MARTA_LINES, type MartaLine } from "@/db/schema"
import type { StationSummary } from "@/lib/stations"
import { LineBadge } from "@/components/jobs/LineBadge"

export type StationAssociationInput = { stationId: string; walkMiles: string }

type StationPickerProps = {
  stations: StationSummary[]
  selected: StationAssociationInput[]
  onChange: (next: StationAssociationInput[]) => void
  /** Keyed by stationId — the offending half of a publish-time 422 (spec deliverable 4). */
  violations?: Record<string, string>
}

const DEFAULT_WALK_MILES = "0.50"

/**
 * Line-grouped checkboxes over all 38 stations, each with a walk-mile claim
 * input once selected (UI direction component inventory). A station with
 * more than one line appears once per line group it belongs to — selection
 * state is keyed by `stationId`, so checking it under one line's heading
 * checks it everywhere else it's listed too.
 */
export function StationPicker({ stations, selected, onChange, violations = {} }: StationPickerProps) {
  const selectedById = new Map(selected.map((association) => [association.stationId, association]))

  function toggleStation(stationId: string, checked: boolean) {
    if (checked) {
      onChange([...selected, { stationId, walkMiles: DEFAULT_WALK_MILES }])
      return
    }
    onChange(selected.filter((association) => association.stationId !== stationId))
  }

  function setWalkMiles(stationId: string, walkMiles: string) {
    onChange(
      selected.map((association) =>
        association.stationId === stationId ? { ...association, walkMiles } : association,
      ),
    )
  }

  const stationsByLine = new Map<MartaLine, StationSummary[]>(
    MARTA_LINES.map((line) => [line, stations.filter((station) => station.lines.includes(line))]),
  )

  return (
    <div className="flex flex-col gap-5">
      {MARTA_LINES.map((line) => {
        const lineStations = stationsByLine.get(line) ?? []
        if (lineStations.length === 0) return null

        return (
          <fieldset key={line} className="flex flex-col gap-2">
            <legend className="mb-1">
              <LineBadge line={line} />
            </legend>
            <div className="flex flex-col gap-2">
              {lineStations.map((station) => {
                const association = selectedById.get(station.stationId)
                const checked = association != null
                const violation = violations[station.stationId]

                return (
                  <div
                    key={`${line}-${station.stationId}`}
                    className="flex flex-wrap items-center gap-3 rounded border border-ink-primary/10 px-3 py-2 has-checked:border-ink-primary has-checked:bg-ink-primary/5"
                  >
                    <label className="flex flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleStation(station.stationId, event.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-sm font-medium text-ink-primary">{station.name}</span>
                    </label>

                    {checked && (
                      <label className="flex items-center gap-1.5 text-xs text-ink-primary/70">
                        Walk claim
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          max="1"
                          step="0.01"
                          value={association.walkMiles}
                          onChange={(event) => setWalkMiles(station.stationId, event.target.value)}
                          aria-label={`Walk distance claim to ${station.name}, in miles`}
                          className="w-20 rounded border border-ink-primary/10 px-2 py-1 text-sm tabular-nums text-ink-primary"
                        />
                        mi
                      </label>
                    )}

                    {violation && (
                      <p role="alert" className="w-full text-xs text-line-red">
                        {violation}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
