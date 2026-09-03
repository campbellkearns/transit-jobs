import { requireDatabaseUrl } from "../db/env"
import { runSeed } from "../db/seed"

async function main() {
  const { stationCount, removedCount, employerCount, companyCount, jobCount, jobStationCount } =
    await runSeed(requireDatabaseUrl())
  const removed = removedCount > 0 ? `, removed ${removedCount} stale` : ""
  console.log(`Seeded ${stationCount} MARTA rail stations${removed}.`)
  console.log(
    `Seeded ${employerCount} fictional employers, ${companyCount} companies, ` +
      `${jobCount} published jobs, ${jobStationCount} job-station associations.`,
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
