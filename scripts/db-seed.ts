import { requireDatabaseUrl } from "../db/env"
import { runSeed } from "../db/seed"

async function main() {
  const { stationCount, removedCount } = await runSeed(requireDatabaseUrl())
  const removed = removedCount > 0 ? `, removed ${removedCount} stale` : ""
  console.log(`Seeded ${stationCount} MARTA rail stations${removed}.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
