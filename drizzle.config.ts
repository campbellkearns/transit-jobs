import type { Config } from "drizzle-kit"

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // PostGIS installs its own `spatial_ref_sys` table into `public`. Without
  // this filter drizzle-kit treats it as a stray table and stops to ask
  // whether to drop it — which hangs any non-interactive push.
  extensionsFilters: ["postgis"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config
