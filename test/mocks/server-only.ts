// Stand-in for the `server-only` package under Vitest. The real package
// throws unconditionally unless Next's build pipeline swaps it out based
// on Server/Client Component compilation target — a distinction Vitest
// has no concept of. Aliased in vitest.config.ts.
export {}
