"use client"

import Link from "next/link"
import { useEffect } from "react"

/**
 * Route-level error boundary — the safety net for server-component failures
 * on every page (search, job detail, employer tools). Without it, a thrown
 * server render surfaces in production as a minified React hydration error
 * (#441) over a cryptic framework page; with it, the visitor gets honest
 * copy, an error reference for support, and a way forward.
 *
 * The search page additionally catches its own query failures so it can keep
 * the header and filter bar usable — this boundary is for everything else.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-sm uppercase tracking-wide text-ink-primary/60">
        Transit to Work
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-ink-primary">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-sm text-ink-primary/70">
        We hit an unexpected error loading this page. It usually clears on
        retry — if it keeps happening, check back in a few minutes.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-ink-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-primary/90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-ink-primary/20 px-4 py-2.5 text-sm text-ink-primary hover:bg-ink-primary/5"
        >
          Back to home
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-6 text-xs text-ink-primary/40">
          Error reference: {error.digest}
        </p>
      ) : null}
    </main>
  )
}
