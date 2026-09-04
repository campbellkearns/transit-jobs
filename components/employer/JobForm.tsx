"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { EXPERIENCE_LEVELS, JOB_CATEGORIES } from "@/lib/jobs/taxonomy"
import type { EmployerJobView, JobStatus } from "@/lib/employer/jobs"
import type { StationSummary } from "@/lib/stations"

import { MapPinField, type PinInput } from "./MapPinField"
import { StationPicker, type StationAssociationInput } from "./StationPicker"
import { PublishButton } from "./PublishButton"

const FIELD_CLASS = "rounded border border-ink-primary/10 px-3 py-2 text-base text-ink-primary"
const LABEL_CLASS = "flex flex-col gap-1 text-sm text-ink-primary"

type JobFormProps = {
  stations: StationSummary[]
  initialJob: EmployerJobView | null
  /**
   * A one-time success notice to show on mount, passed via a `?notice=`
   * query param on the redirect a fresh create-then-save/publish makes to
   * this job's stable edit URL. Local `notice` state can't carry the
   * message across that redirect itself — it unmounts this component
   * (see `persist`) — so the destination page re-supplies it once.
   */
  initialNotice?: string | null
}

const NOTICE_QUERY_PARAM = "notice"
const PUBLISHED_NOTICE = "Published — visible to seekers now."

type FormState = {
  title: string
  description: string
  category: string
  experienceLevel: string
  salaryMin: string
  salaryMax: string
  addressText: string
  pin: PinInput
  applyUrl: string
  stations: StationAssociationInput[]
}

function toFormState(job: EmployerJobView | null): FormState {
  return {
    title: job?.title ?? "",
    description: job?.description ?? "",
    category: job?.category ?? JOB_CATEGORIES[0],
    experienceLevel: job?.experienceLevel ?? EXPERIENCE_LEVELS[0],
    salaryMin: job?.salaryMin != null ? String(job.salaryMin) : "",
    salaryMax: job?.salaryMax != null ? String(job.salaryMax) : "",
    addressText: job?.addressText ?? "",
    pin: { lng: job ? String(job.pin.lng) : "", lat: job ? String(job.pin.lat) : "" },
    applyUrl: job?.applyUrl ?? "",
    stations:
      job?.stations.map((station) => ({
        stationId: station.stationId,
        walkMiles: station.walkMiles.toFixed(2),
      })) ?? [],
  }
}

/** Best-effort client-side completeness check — the actual one-mile check is server-authoritative. */
function isCompleteEnoughToPublish(form: FormState): boolean {
  const lat = Number(form.pin.lat)
  const lng = Number(form.pin.lng)
  return (
    form.title.trim().length > 0 &&
    form.description.trim().length > 0 &&
    form.category.trim().length > 0 &&
    form.experienceLevel.trim().length > 0 &&
    form.addressText.trim().length > 0 &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    form.stations.length > 0 &&
    form.stations.every((station) => {
      const walkMiles = Number(station.walkMiles)
      return Number.isFinite(walkMiles) && walkMiles > 0 && walkMiles <= 1
    })
  )
}

/** Builds the request body `jobInputSchema` expects, or an error if a required numeric field won't parse. */
function buildPayload(form: FormState): { data: Record<string, unknown> } | { error: string } {
  const lat = Number(form.pin.lat)
  const lng = Number(form.pin.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Enter a valid pin latitude and longitude." }
  }

  const stations: { stationId: string; walkMiles: number }[] = []
  for (const station of form.stations) {
    const walkMiles = Number(station.walkMiles)
    if (!Number.isFinite(walkMiles)) {
      return { error: "Every selected station needs a numeric walk distance claim." }
    }
    stations.push({ stationId: station.stationId, walkMiles })
  }

  return {
    data: {
      title: form.title,
      description: form.description,
      category: form.category,
      experienceLevel: form.experienceLevel,
      salaryMin: form.salaryMin.trim() === "" ? null : Number(form.salaryMin),
      salaryMax: form.salaryMax.trim() === "" ? null : Number(form.salaryMax),
      addressText: form.addressText,
      pin: { lng, lat },
      applyUrl: form.applyUrl.trim() === "" ? null : form.applyUrl.trim(),
      stations,
    },
  }
}

type StationViolationPayload = { stationId: string; stationName: string; distanceMiles: number }

/**
 * The single-column, four-section employer form (UI direction art_cJdHuq28):
 * role basics, location, stations, review + publish. Shared between create
 * and edit — both save the full local state wholesale (spec deliverable 4)
 * — so this component owns all the form state and the three independent
 * network actions (save, publish, unpublish) rather than splitting them
 * across page components.
 */
export function JobForm({ stations, initialJob, initialNotice = null }: JobFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => toFormState(initialJob))
  const [jobId, setJobId] = useState<string | null>(initialJob?.id ?? null)
  const [status, setStatus] = useState<JobStatus>(initialJob?.status ?? "draft")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(initialNotice)
  const [violations, setViolations] = useState<Record<string, string>>({})

  // The notice above was handed off once via `?notice=` on the redirect
  // that created this page load (see `persist`'s doc comment). Strip it so
  // a manual refresh of this URL doesn't replay a stale success message.
  useEffect(() => {
    if (initialNotice == null) return
    const url = new URL(window.location.href)
    url.searchParams.delete(NOTICE_QUERY_PARAM)
    router.replace(url.pathname + url.search, { scroll: false })
    // Runs once on mount to consume the one-time query param; `initialNotice`
    // and `router` are stable for the lifetime of a given page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setNotice(null)
  }

  /**
   * Creates or updates the job from current form state. Returns the job id
   * on success. Deliberately does not navigate — a caller that just
   * created the job may still make further server calls (e.g. publish)
   * against that id, and redirecting mid-flow would unmount this
   * component before those calls' state updates land, leaving the fresh
   * page's server-rendered snapshot to win with stale data.
   */
  async function persist(): Promise<string | null> {
    const payload = buildPayload(form)
    if ("error" in payload) {
      setError(payload.error)
      return null
    }

    const response = await fetch(jobId ? `/api/employer/jobs/${jobId}` : "/api/employer/jobs", {
      method: jobId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.data),
    })
    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(body.error ?? "Something went wrong saving this job.")
      return null
    }

    const id: string = jobId ?? body.id
    if (!jobId) setJobId(id)
    return id
  }

  async function handleSave() {
    setPending(true)
    setError(null)
    setNotice(null)
    const wasNewJob = jobId == null

    const id = await persist()
    setPending(false)
    if (!id) return

    setNotice(wasNewJob ? "Draft saved." : "Changes saved.")
    if (wasNewJob) router.replace(`/employer/jobs/${id}/edit?${NOTICE_QUERY_PARAM}=draft`)
  }

  async function handlePublish() {
    setPending(true)
    setError(null)
    setNotice(null)
    setViolations({})
    const wasNewJob = jobId == null

    const id = await persist()
    if (!id) {
      setPending(false)
      return
    }

    const response = await fetch(`/api/employer/jobs/${id}/publish`, { method: "POST" })
    const body = await response.json().catch(() => ({}))

    if (response.ok) {
      setStatus("published")
      setNotice(PUBLISHED_NOTICE)
    } else if (response.status === 422 && Array.isArray(body.violations)) {
      const violationsByStation = body.violations as StationViolationPayload[]
      const next: Record<string, string> = {}
      for (const violation of violationsByStation) {
        next[violation.stationId] =
          `${violation.stationName} is ${violation.distanceMiles.toFixed(2)} mi from the pin — more than 1 mile away.`
      }
      setViolations(next)
      setError(
        violationsByStation.length > 0
          ? "One or more selected stations are more than one mile from the pin. Fix the pair named below, then publish again."
          : body.error,
      )
    } else {
      setError(body.error ?? "Couldn't publish this job.")
    }

    setPending(false)

    // Only navigate on success. A brand-new job's publish attempt that
    // fails (422 naming a station, or any other error) leaves the employer
    // right where they are, with the inline violations and error text
    // still on screen — navigating here would unmount this component
    // before they could see why it failed, for the same reason `persist`
    // never navigates mid-flow. The draft itself is safely saved either way.
    if (wasNewJob && response.ok) {
      router.replace(`/employer/jobs/${id}/edit?${NOTICE_QUERY_PARAM}=published`)
    }
  }

  async function handleUnpublish() {
    if (!jobId) return
    setPending(true)
    setError(null)
    setNotice(null)

    const response = await fetch(`/api/employer/jobs/${jobId}/unpublish`, { method: "POST" })
    const body = await response.json().catch(() => ({}))

    if (response.ok) {
      setStatus("draft")
      setNotice("Unpublished — back to draft.")
    } else {
      setError(body.error ?? "Couldn't unpublish this job.")
    }

    setPending(false)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-primary/60">
          <span
            className={`h-2 w-2 rounded-full ${status === "published" ? "bg-line-green" : "bg-ink-primary/30"}`}
            aria-hidden="true"
          />
          {status === "published" ? "Published" : "Draft"}
        </span>

        {status === "published" && jobId && (
          <button
            type="button"
            onClick={handleUnpublish}
            disabled={pending}
            className="rounded border border-ink-primary/20 px-3 py-1.5 text-sm text-ink-primary disabled:opacity-50"
          >
            Unpublish
          </button>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-primary/60">
          01 · Role basics
        </h2>
        <label className={LABEL_CLASS}>
          Job title
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            required
            className={FIELD_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          Description
          <textarea
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            required
            rows={5}
            className={FIELD_CLASS}
          />
        </label>
        <div className="flex gap-3">
          <label className={`flex-1 ${LABEL_CLASS}`}>
            Category
            <select
              value={form.category}
              onChange={(event) => updateField("category", event.target.value)}
              className={FIELD_CLASS}
            >
              {JOB_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className={`flex-1 ${LABEL_CLASS}`}>
            Experience level
            <select
              value={form.experienceLevel}
              onChange={(event) => updateField("experienceLevel", event.target.value)}
              className={FIELD_CLASS}
            >
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-3">
          <label className={`flex-1 ${LABEL_CLASS}`}>
            Salary min (USD/yr)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={form.salaryMin}
              onChange={(event) => updateField("salaryMin", event.target.value)}
              className={`tabular-nums ${FIELD_CLASS}`}
            />
          </label>
          <label className={`flex-1 ${LABEL_CLASS}`}>
            Salary max (USD/yr)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={form.salaryMax}
              onChange={(event) => updateField("salaryMax", event.target.value)}
              className={`tabular-nums ${FIELD_CLASS}`}
            />
          </label>
        </div>
        <label className={LABEL_CLASS}>
          Application URL (optional)
          <input
            type="url"
            value={form.applyUrl}
            onChange={(event) => updateField("applyUrl", event.target.value)}
            placeholder="https://…"
            className={FIELD_CLASS}
          />
        </label>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-primary/60">
          02 · Location
        </h2>
        <MapPinField
          addressText={form.addressText}
          pin={form.pin}
          onAddressChange={(value) => updateField("addressText", value)}
          onPinChange={(value) => updateField("pin", value)}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-primary/60">
          03 · Stations
        </h2>
        <p className="text-sm text-ink-primary/70">
          Select every station within walking distance of the pin. Publishing rejects any
          selected station more than one mile from the pin (spec deliverable 4).
        </p>
        <StationPicker
          stations={stations}
          selected={form.stations}
          onChange={(value) => {
            setForm((prev) => ({ ...prev, stations: value }))
            setViolations({})
          }}
          violations={violations}
        />
      </section>

      <section className="flex flex-col gap-4 border-t border-ink-primary/10 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-primary/60">
          04 · Review + publish
        </h2>

        {error && (
          <p role="alert" className="text-sm text-line-red">
            {error}
          </p>
        )}
        {notice && !error && <p className="text-sm text-ink-primary/70">{notice}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="rounded border border-ink-primary/20 px-4 py-2.5 text-sm font-medium text-ink-primary disabled:opacity-50"
          >
            {jobId ? "Save changes" : "Save draft"}
          </button>

          {status !== "published" && (
            <PublishButton
              disabled={!isCompleteEnoughToPublish(form)}
              pending={pending}
              onClick={handlePublish}
            />
          )}
        </div>
      </section>
    </div>
  )
}
