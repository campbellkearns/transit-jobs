"use client"

import type { ChangeEvent } from "react"

import { MARTA_LINES } from "@/db/schema"
import { EXPERIENCE_LEVELS, JOB_CATEGORIES } from "@/lib/jobs/taxonomy"
import {
  FILTER_PARAM,
  RADIUS_OPTIONS,
  type SearchFilters,
  hasActiveFilters,
} from "@/lib/search/filters"

import { LineBadge } from "./LineBadge"

const FIELD_CLASS =
  "rounded border border-ink-primary/10 bg-white px-3 py-2 text-sm text-ink-primary"
const LABEL_CLASS = "flex flex-col gap-1 text-xs font-medium text-ink-primary/70"

type FilterBarProps = {
  filters: SearchFilters
}

/**
 * The seeker's filter controls, as a plain GET form.
 *
 * A form — not click handlers pushing router state — because search state
 * lives in the URL (see lib/search/filters). Submitting navigates, which
 * gives back/forward, reload, and link-sharing for free, and leaves the page
 * usable with JavaScript off. The only thing the client layer adds is
 * auto-submit on select and checkbox changes, so a mouse user does not have
 * to hunt for a button; the button stays rendered for keyboard users, for
 * the keyword field, and for the no-JS case.
 */
export function FilterBar({ filters }: FilterBarProps) {
  function submitOnChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form
      method="get"
      action="/search"
      className="border-b border-ink-primary/10 bg-white px-4 py-4 sm:px-6"
      aria-label="Job search filters"
    >
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Search jobs by keyword</span>
          <input
            type="search"
            name={FILTER_PARAM.keyword}
            defaultValue={filters.keyword}
            placeholder="Role, company, or keyword"
            maxLength={200}
            className={`w-full ${FIELD_CLASS} text-base`}
          />
        </label>
        <button
          type="submit"
          className="rounded bg-ink-primary px-4 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
      </div>

      {/*
        Collapsible on small screens so the results list stays the first thing
        a seeker sees on a phone (UI direction art_cJdHuq28). `open` by
        default and the summary is hidden from `md` up, so on a wide screen
        the controls are simply always visible — no JavaScript state, and no
        second copy of the same named inputs in the DOM.
      */}
      <details open className="mt-3">
        <summary className="cursor-pointer text-sm text-ink-primary/70 md:hidden">
          Filters
        </summary>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <fieldset className="sm:col-span-2 lg:col-span-4">
            <legend className="text-xs font-medium text-ink-primary/70">
              MARTA line
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {MARTA_LINES.map((line) => (
                <label
                  key={line}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink-primary/15 px-3 py-1.5 text-sm has-checked:border-ink-primary has-checked:bg-ink-primary/5"
                >
                  <input
                    type="checkbox"
                    name={FILTER_PARAM.line}
                    value={line}
                    defaultChecked={filters.lines.includes(line)}
                    onChange={submitOnChange}
                    className="h-3.5 w-3.5"
                  />
                  <LineBadge line={line} />
                </label>
              ))}
            </div>
          </fieldset>

          <label className={LABEL_CLASS}>
            Walking radius
            <select
              name={FILTER_PARAM.radius}
              defaultValue={String(filters.radiusMiles)}
              onChange={submitOnChange}
              className={FIELD_CLASS}
            >
              {RADIUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} {option === 1 ? "mile" : "miles"}
                </option>
              ))}
            </select>
          </label>

          <label className={LABEL_CLASS}>
            Category
            <select
              name={FILTER_PARAM.category}
              defaultValue={filters.category ?? ""}
              onChange={submitOnChange}
              className={FIELD_CLASS}
            >
              <option value="">Any category</option>
              {JOB_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className={LABEL_CLASS}>
            Experience
            <select
              name={FILTER_PARAM.experienceLevel}
              defaultValue={filters.experienceLevel ?? ""}
              onChange={submitOnChange}
              className={FIELD_CLASS}
            >
              <option value="">Any experience</option>
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="text-xs font-medium text-ink-primary/70">
              Salary (USD / year)
            </legend>
            <div className="mt-1 flex items-center gap-2">
              <label className="flex-1">
                <span className="sr-only">Minimum salary</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  name={FILTER_PARAM.salaryMin}
                  defaultValue={filters.salaryMin ?? ""}
                  placeholder="Min"
                  className={`w-full tabular-nums ${FIELD_CLASS}`}
                />
              </label>
              <span aria-hidden="true" className="text-ink-primary/40">
                –
              </span>
              <label className="flex-1">
                <span className="sr-only">Maximum salary</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  name={FILTER_PARAM.salaryMax}
                  defaultValue={filters.salaryMax ?? ""}
                  placeholder="Max"
                  className={`w-full tabular-nums ${FIELD_CLASS}`}
                />
              </label>
            </div>
          </fieldset>
        </div>

        {hasActiveFilters(filters) && (
          <p className="mt-3 text-sm">
            <a href="/search" className="underline underline-offset-2">
              Clear all filters
            </a>
          </p>
        )}
      </details>
    </form>
  )
}
