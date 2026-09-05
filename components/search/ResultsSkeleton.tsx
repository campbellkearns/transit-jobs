const ROW_COUNT = 6

function SkeletonBar({ className }: { className: string }) {
  return <div className={`rounded bg-ink-primary/10 ${className}`} />
}

/**
 * Placeholder rows shown while the proximity query runs.
 *
 * Rows rather than a spinner, and rows shaped like the real thing (UI
 * direction art_cJdHuq28): the layout does not jump when results arrive, and
 * the seeker can see that a list is coming rather than guessing what will
 * appear. Marked `aria-hidden` under a live "Searching" message, since the
 * shapes carry nothing a screen reader can use.
 */
export function ResultsSkeleton() {
  return (
    <div>
      <p role="status" className="px-4 py-3 text-sm text-ink-primary/70 sm:px-6">
        Searching jobs near MARTA rail…
      </p>
      <ul
        aria-hidden="true"
        className="animate-pulse divide-y divide-ink-primary/10 border-t border-ink-primary/10"
      >
        {Array.from({ length: ROW_COUNT }, (_, index) => (
          <li key={index} className="px-4 py-4 sm:px-6">
            <SkeletonBar className="h-4 w-2/5" />
            <SkeletonBar className="mt-2.5 h-3 w-3/5" />
            <SkeletonBar className="mt-2 h-3 w-1/2" />
          </li>
        ))}
      </ul>
    </div>
  )
}
