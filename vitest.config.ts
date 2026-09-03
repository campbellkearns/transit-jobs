import { createRequire } from "module"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "url"

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    server: {
      // Force next-auth through Vite's own resolver instead of Node's
      // native ESM loader. Externalized (the SSR default for node_modules)
      // means aliases never apply and next-auth's bare `import "next/server"`
      // hits Node's strict ESM resolution, which fails without an explicit
      // extension (Next's package.json has no "exports" map for it).
      deps: {
        inline: [/next-auth/],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // next-auth's ESM build does `import "next/server"` — a bare subpath
      // Next.js's own webpack/turbopack resolver handles fine but that
      // next's package.json has no "exports" entry for, so Vite's strict
      // ESM resolution can't find it without an explicit extension. Alias
      // to the resolved file so Vitest's Vite-based resolver stops
      // guessing at extensions.
      "next/server": require.resolve("next/server"),
      // `server-only` throws unconditionally at import time; Next's build
      // pipeline swaps it for a no-op in server bundles, a distinction
      // Vitest has no equivalent for. Stub it so files that guard against
      // client-bundle leakage (e.g. lib/auth/users.ts) load under test.
      "server-only": fileURLToPath(new URL("./test/mocks/server-only.ts", import.meta.url)),
    },
  },
})
