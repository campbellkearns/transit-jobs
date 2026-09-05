# transit-jobs

Transit to Work — a job search platform where MARTA rail proximity is a first-class filter. Job seekers search and browse roles by line, station, and walk distance; employers post roles validated within one mile of selected rail stations.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Drizzle ORM on Postgres/PostGIS (Neon)
- Vitest (unit) + Playwright (E2E)
- GitHub Actions CI: lint, typecheck, unit tests, build on every PR

## Getting started

```bash
npm install
cp .env.example .env   # set DATABASE_URL once a database exists
npm run dev
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (unit) |
| `npm run test:e2e` | Playwright (E2E, not yet wired into CI — lands in the release-gate task) |
| `npm run db:push` | Push Drizzle schema to the database |

## Design tokens

Shared UI tokens (MARTA line colors, ink-primary action color, type scale) live in `lib/design-tokens.ts` and are wired into `tailwind.config.ts`. See the UI direction blueprint (`art_cJdHuq28`) for rationale — line hues are data, never a brand mark.
