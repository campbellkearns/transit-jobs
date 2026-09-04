"use client"

export type PinInput = { lng: string; lat: string }

type MapPinFieldProps = {
  addressText: string
  pin: PinInput
  onAddressChange: (value: string) => void
  onPinChange: (value: PinInput) => void
}

const FIELD_CLASS = "rounded border border-ink-primary/10 px-3 py-2 text-sm tabular-nums text-ink-primary"

/**
 * Office address text plus the coordinate of record, with a live OSM
 * preview beside it (UI direction: "address text + map-pin preview beside
 * the picker"). The pin's lng/lat are the two numbers actually validated
 * server-side against every selected station — the address is a label for
 * people, never parsed into a coordinate, so it can't silently drift from
 * the pin it's supposed to describe.
 *
 * The preview is the official OpenStreetMap embed (`export/embed.html`),
 * not a Leaflet map: it needs no new dependency, ships the "©
 * OpenStreetMap contributors" attribution the spec requires on the map
 * itself, and re-centers as the lng/lat inputs change. It's read-only —
 * placement happens by typing coordinates, not by clicking the embed
 * (which is cross-origin and can't report clicks back to this page).
 */
export function MapPinField({ addressText, pin, onAddressChange, onPinChange }: MapPinFieldProps) {
  const lng = Number(pin.lng)
  const lat = Number(pin.lat)
  const hasValidPin = Number.isFinite(lng) && Number.isFinite(lat)

  // A small bounding box around the pin so the embed zooms to street level
  // instead of the whole world.
  const bboxDegrees = 0.006
  const bbox = hasValidPin
    ? `${lng - bboxDegrees}%2C${lat - bboxDegrees}%2C${lng + bboxDegrees}%2C${lat + bboxDegrees}`
    : null
  const embedSrc = bbox
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat}%2C${lng}&layer=mapnik`
    : null

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-ink-primary">
        Office address
        <input
          value={addressText}
          onChange={(event) => onAddressChange(event.target.value)}
          placeholder="123 Peachtree St NE, Atlanta, GA"
          required
          className="rounded border border-ink-primary/10 px-3 py-2 text-base text-ink-primary"
        />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs text-ink-primary/70">
          Pin latitude
          <input
            type="number"
            inputMode="decimal"
            step="0.000001"
            min="-90"
            max="90"
            value={pin.lat}
            onChange={(event) => onPinChange({ ...pin, lat: event.target.value })}
            required
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-ink-primary/70">
          Pin longitude
          <input
            type="number"
            inputMode="decimal"
            step="0.000001"
            min="-180"
            max="180"
            value={pin.lng}
            onChange={(event) => onPinChange({ ...pin, lng: event.target.value })}
            required
            className={FIELD_CLASS}
          />
        </label>
      </div>

      <div className="overflow-hidden rounded border border-ink-primary/10">
        {embedSrc ? (
          <iframe
            title="Office pin preview"
            src={embedSrc}
            className="h-56 w-full"
            style={{ border: 0 }}
          />
        ) : (
          <p className="flex h-56 items-center justify-center bg-ink-primary/5 px-4 text-center text-sm text-ink-primary/60">
            Enter a latitude and longitude to preview the pin on the map.
          </p>
        )}
      </div>
      <p className="text-xs text-ink-primary/60">© OpenStreetMap contributors</p>
    </div>
  )
}
