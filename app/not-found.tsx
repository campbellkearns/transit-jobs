import Link from "next/link"

/**
 * Branded 404 for `notFound()` calls (missing or draft jobs, unknown routes).
 * The draft-404 contract in e2e asserts the 404 status and this page's
 * heading, so the copy is free to be helpful: name the two likely causes and
 * offer the two main doors. A stranger who followed a dead link should not
 * land on the browser's idea of a dead end.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-sm uppercase tracking-wide text-ink-primary/60">
        Transit to Work
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-ink-primary">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-sm text-ink-primary/70">
        The page you are looking for does not exist, or the job you followed is
        no longer publicly visible.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/search"
          className="rounded-md bg-ink-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-primary/90"
        >
          Search jobs
        </Link>
        <Link
          href="/"
          className="rounded-md border border-ink-primary/20 px-4 py-2.5 text-sm text-ink-primary hover:bg-ink-primary/5"
        >
          Back to home
        </Link>
      </div>
    </main>
  )
}
