import Link from "next/link"

const LINES = [
  { name: "BLUE", className: "bg-line-blue" },
  { name: "GOLD", className: "bg-line-gold" },
  { name: "GREEN", className: "bg-line-green" },
  { name: "RED", className: "bg-line-red" },
] as const

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start gap-6 px-6 py-16">
      <p className="text-sm uppercase tracking-wide text-ink-primary/60">
        Transit to Work
      </p>
      <h1 className="text-4xl font-semibold text-ink-primary">
        Jobs within a mile of MARTA rail
      </h1>
      <p className="text-base text-ink-primary/80">
        Search Atlanta-area roles by rail line, station, and walk distance.
      </p>
      <Link
        href="/search"
        className="rounded-md bg-ink-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-primary/90"
      >
        Search jobs near MARTA rail
      </Link>
      <ul className="flex flex-wrap gap-2" aria-label="MARTA rail lines">
        {LINES.map((line) => (
          <li
            key={line.name}
            className={`flex items-center gap-2 rounded-full border border-ink-primary/10 px-3 py-1 text-sm text-ink-primary`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${line.className}`}
              aria-hidden="true"
            />
            {line.name}
          </li>
        ))}
      </ul>
    </main>
  )
}
