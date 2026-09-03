import { enableExtensions } from "../db/extensions"
import { requireDatabaseUrl } from "../db/env"

async function main() {
  await enableExtensions(requireDatabaseUrl())
  console.log("PostGIS extension is enabled.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
