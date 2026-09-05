import { createHash } from "node:crypto"

import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

import type { LngLat } from "./postgis"
import { companies, jobs, jobStations, stations, users } from "./schema"
import type { Database } from "./seed"

/**
 * Fictional Atlanta-area employers and jobs for a non-empty launch (deliverable
 * 8). Every company name below is invented — MARTA's platform-empty state is
 * honest about seeded content, but seeding a *real* company's name would
 * imply an opening that doesn't exist, which is the one thing the spec rules
 * out (see "Fictional seed employers" in the constraints section of
 * transit-jobs-mvp-spec). Street addresses are real Atlanta streets used only
 * for descriptive flavor; the coordinate of record for each job is the pin
 * computed below, not a geocode of the address text.
 */

const SEED_PASSWORD = "seed-content-not-a-real-password"
const BCRYPT_ROUNDS = 12

// Arbitrary, fixed namespace for this seed's deterministic ids — any stable
// UUID works here; what matters is that it never changes between runs.
const SEED_UUID_NAMESPACE = "b7e6f1e0-2f0a-4c1e-9b8d-6f6c9a6f9b21"

/**
 * RFC 4122 v5 UUID, deterministic in `name`.
 *
 * `jobs.id` and `companies.id` have no natural key of their own — two
 * "Assembly Technician" postings from the same company would otherwise be
 * indistinguishable on rerun. Deriving the id from stable content (company
 * email, job title) instead of `defaultRandom()` makes re-running the seed an
 * update-in-place rather than a duplicate insert, the same guarantee stations
 * get for free from `stop_id`. Exported for direct testing, same as the other
 * pure GTFS/geo helpers in this codebase.
 */
export function deterministicUuid(name: string): string {
  const namespaceBytes = Buffer.from(SEED_UUID_NAMESPACE.replace(/-/g, ""), "hex")
  const hash = createHash("sha1").update(namespaceBytes).update(name, "utf8").digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x50, 6) // version 5
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8) // RFC 4122 variant
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const EARTH_RADIUS_MILES = 3958.8

/**
 * The point `distanceMiles` from `origin` along `bearingDegrees` (0 = north,
 * clockwise), via the standard spherical-earth destination formula. Used to
 * place each job's pin a believable walk from its associated station: real
 * geodesic distance, computed once, so "within one mile" is true by
 * construction rather than asserted after the fact.
 */
export function destinationPoint(
  origin: LngLat,
  bearingDegrees: number,
  distanceMiles: number,
): LngLat {
  const angularDistance = distanceMiles / EARTH_RADIUS_MILES
  const bearing = (bearingDegrees * Math.PI) / 180
  const lat1 = (origin.lat * Math.PI) / 180
  const lng1 = (origin.lng * Math.PI) / 180

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    )

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (((lng2 * 180) / Math.PI + 540) % 360) - 180,
  }
}

/**
 * Deterministic bearing/distance for the job at `index`, so 24 pins spread
 * plausibly around their stations without hand-picking 48 numbers. 137 is
 * coprime with 360, so the bearing cycles through 24 distinct directions
 * before repeating; distance cycles through eight values from 0.15 to 0.71
 * miles, always inside the one-mile walk claim the schema allows.
 */
function pinOffsetFor(index: number): { bearingDegrees: number; distanceMiles: number } {
  const BEARING_STEP_DEGREES = 137
  const BASE_DISTANCE_MILES = 0.15
  const DISTANCE_STEP_MILES = 0.08
  return {
    bearingDegrees: (index * BEARING_STEP_DEGREES) % 360,
    distanceMiles: BASE_DISTANCE_MILES + DISTANCE_STEP_MILES * (index % 8),
  }
}

export type FictionalEmployer = {
  contactEmail: string
  companyName: string
  websiteUrl: string
  description: string
}

/** Twelve fictional employers — none of these companies exist. */
export const FICTIONAL_EMPLOYERS: FictionalEmployer[] = [
  {
    contactEmail: "hiring@kudzurobotics.seed.transitjobs.example",
    companyName: "Kudzu Robotics Co.",
    websiteUrl: "https://kudzurobotics.example",
    description: "Small-batch industrial automation and robotic-arm assembly for Southeast manufacturers.",
  },
  {
    contactEmail: "careers@beltlinefoods.seed.transitjobs.example",
    companyName: "Beltline Foods Collective",
    websiteUrl: "https://beltlinefoods.example",
    description: "Neighborhood grocery cooperative stocking Georgia-grown produce across four Atlanta storefronts.",
  },
  {
    contactEmail: "jobs@sweetwateranalytics.seed.transitjobs.example",
    companyName: "Sweetwater Analytics",
    websiteUrl: "https://sweetwateranalytics.example",
    description: "Data engineering and analytics consultancy serving logistics and retail clients.",
  },
  {
    contactEmail: "careers@chattahoocheehealth.seed.transitjobs.example",
    companyName: "Chattahoochee Health Partners",
    websiteUrl: "https://chattahoocheehealth.example",
    description: "Outpatient clinic network offering primary and urgent care across metro Atlanta.",
  },
  {
    contactEmail: "hiring@stonemilelogistics.seed.transitjobs.example",
    companyName: "Stone Mile Logistics",
    websiteUrl: "https://stonemilelogistics.example",
    description: "Regional freight dispatch and warehousing for last-mile delivery partners.",
  },
  {
    contactEmail: "careers@freedomparkfinancial.seed.transitjobs.example",
    companyName: "Freedom Park Financial",
    websiteUrl: "https://freedomparkfinancial.example",
    description: "Community-focused consumer lending and personal finance services.",
  },
  {
    contactEmail: "jobs@tracksidecoffee.seed.transitjobs.example",
    companyName: "Trackside Coffee Roasters",
    websiteUrl: "https://tracksidecoffee.example",
    description: "Small-batch coffee roaster and cafe operator with locations near rail stations.",
  },
  {
    contactEmail: "careers@ironwoodlegal.seed.transitjobs.example",
    companyName: "Ironwood Legal Group",
    websiteUrl: "https://ironwoodlegal.example",
    description: "Corporate and real-estate legal services for small and mid-size businesses.",
  },
  {
    contactEmail: "jobs@magnoliacreative.seed.transitjobs.example",
    companyName: "Magnolia Creative Studio",
    websiteUrl: "https://magnoliacreative.example",
    description: "Branding and marketing studio for regional consumer brands.",
  },
  {
    contactEmail: "hiring@cottonrowmfg.seed.transitjobs.example",
    companyName: "Cotton Row Manufacturing",
    websiteUrl: "https://cottonrowmfg.example",
    description: "Precision metal fabrication and contract manufacturing.",
  },
  {
    contactEmail: "jobs@brightrailtech.seed.transitjobs.example",
    companyName: "Bright Rail Technologies",
    websiteUrl: "https://brightrailtech.example",
    description: "Software vendor building scheduling tools for transit and logistics operators.",
  },
  {
    contactEmail: "careers@harborlightinsurance.seed.transitjobs.example",
    companyName: "Harborlight Insurance Group",
    websiteUrl: "https://harborlightinsurance.example",
    description: "Regional property and casualty insurance underwriter.",
  },
]

export type JobFixture = {
  contactEmail: string
  title: string
  category: string
  experienceLevel: "Entry" | "Mid" | "Senior"
  salaryMin: number
  salaryMax: number
  description: string
  applyUrl: string
  addressText: string
  stationStopId: string
}

/**
 * Twenty-four published jobs across the twelve employers above — two office
 * locations each — chosen so every one of the twelve stations here is used
 * exactly twice and all four MARTA lines are represented several times over
 * (deliverable 8 needs >= 20 jobs, >= 8 stations, all 4 lines).
 */
export const JOB_FIXTURES: JobFixture[] = [
  {
    contactEmail: "hiring@kudzurobotics.seed.transitjobs.example",
    title: "Assembly Technician",
    category: "Manufacturing",
    experienceLevel: "Entry",
    salaryMin: 36000,
    salaryMax: 42000,
    description: "Builds and tests robotic-arm subassemblies on the production line, following torque and safety checklists.",
    applyUrl: "https://kudzurobotics.example/careers/assembly-technician",
    addressText: "88 Marietta St NW, Atlanta, GA 30303",
    stationStopId: "510015", // FIVE POINTS — BLUE, GOLD, GREEN, RED
  },
  {
    contactEmail: "hiring@kudzurobotics.seed.transitjobs.example",
    title: "Robotics QA Engineer",
    category: "Manufacturing",
    experienceLevel: "Mid",
    salaryMin: 58000,
    salaryMax: 72000,
    description: "Runs functional and safety test suites on finished robotic assemblies before they ship to customers.",
    applyUrl: "https://kudzurobotics.example/careers/robotics-qa-engineer",
    addressText: "1780 Moreland Ave NE, Atlanta, GA 30307",
    stationStopId: "510014", // EDGEWOOD-CANDLER PARK — BLUE, GREEN
  },
  {
    contactEmail: "careers@beltlinefoods.seed.transitjobs.example",
    title: "Grocery Team Lead",
    category: "Food Service",
    experienceLevel: "Mid",
    salaryMin: 40000,
    salaryMax: 48000,
    description: "Runs daily floor operations, staffing, and receiving for a full-service neighborhood grocery location.",
    applyUrl: "https://beltlinefoods.example/careers/grocery-team-lead",
    addressText: "1280 Peachtree St NE, Atlanta, GA 30309",
    stationStopId: "510001", // ARTS CENTER — GOLD, RED
  },
  {
    contactEmail: "careers@beltlinefoods.seed.transitjobs.example",
    title: "Overnight Stocker",
    category: "Food Service",
    experienceLevel: "Entry",
    salaryMin: 32000,
    salaryMax: 36000,
    description: "Receives and shelves grocery deliveries during overnight restock shifts, four nights a week.",
    applyUrl: "https://beltlinefoods.example/careers/overnight-stocker",
    addressText: "1954 Donald Lee Hollowell Pkwy NW, Atlanta, GA 30318",
    stationStopId: "510004", // BANKHEAD — GREEN
  },
  {
    contactEmail: "jobs@sweetwateranalytics.seed.transitjobs.example",
    title: "Data Analyst I",
    category: "Technology",
    experienceLevel: "Entry",
    salaryMin: 52000,
    salaryMax: 60000,
    description: "Builds recurring dashboards and ad-hoc reports for logistics and retail clients' delivery data.",
    applyUrl: "https://sweetwateranalytics.example/careers/data-analyst-i",
    addressText: "999 Peachtree St NE, Atlanta, GA 30309",
    stationStopId: "510026", // MIDTOWN — GOLD, RED
  },
  {
    contactEmail: "jobs@sweetwateranalytics.seed.transitjobs.example",
    title: "Senior Data Engineer",
    category: "Technology",
    experienceLevel: "Senior",
    salaryMin: 92000,
    salaryMax: 115000,
    description: "Designs ingestion pipelines and warehouse models that feed the firm's retail forecasting product.",
    applyUrl: "https://sweetwateranalytics.example/careers/senior-data-engineer",
    addressText: "770 Ralph David Abernathy Blvd SW, Atlanta, GA 30310",
    stationStopId: "510033", // WEST END — GOLD, RED
  },
  {
    contactEmail: "careers@chattahoocheehealth.seed.transitjobs.example",
    title: "Patient Services Coordinator",
    category: "Healthcare",
    experienceLevel: "Entry",
    salaryMin: 34000,
    salaryMax: 40000,
    description: "Schedules appointments, verifies insurance, and handles intake for a primary-care clinic.",
    applyUrl: "https://chattahoocheehealth.example/careers/patient-services-coordinator",
    addressText: "3155 Peachtree Rd NE, Atlanta, GA 30305",
    stationStopId: "510036", // BUCKHEAD — RED
  },
  {
    contactEmail: "careers@chattahoocheehealth.seed.transitjobs.example",
    title: "Clinical Operations Manager",
    category: "Healthcare",
    experienceLevel: "Senior",
    salaryMin: 78000,
    salaryMax: 95000,
    description: "Oversees staffing, scheduling, and compliance across two outpatient clinic sites.",
    applyUrl: "https://chattahoocheehealth.example/careers/clinical-operations-manager",
    addressText: "3400 Main St, College Park, GA 30337",
    stationStopId: "510008", // COLLEGE PARK — GOLD, RED
  },
  {
    contactEmail: "hiring@stonemilelogistics.seed.transitjobs.example",
    title: "Warehouse Associate",
    category: "Logistics & Warehouse",
    experienceLevel: "Entry",
    salaryMin: 34000,
    salaryMax: 38000,
    description: "Picks, packs, and loads outbound freight for regional next-day delivery routes.",
    applyUrl: "https://stonemilelogistics.example/careers/warehouse-associate",
    addressText: "2500 Piedmont Rd NE, Atlanta, GA 30324",
    stationStopId: "510024", // LINDBERGH CENTER — GOLD, RED
  },
  {
    contactEmail: "hiring@stonemilelogistics.seed.transitjobs.example",
    title: "Fleet Dispatcher",
    category: "Logistics & Warehouse",
    experienceLevel: "Mid",
    salaryMin: 46000,
    salaryMax: 56000,
    description: "Routes drivers in real time and resolves delivery exceptions across the metro fleet.",
    applyUrl: "https://stonemilelogistics.example/careers/fleet-dispatcher",
    addressText: "231 Peachtree Center Ave NE, Atlanta, GA 30303",
    stationStopId: "510040", // PEACHTREE CENTER — GOLD, RED
  },
  {
    contactEmail: "careers@freedomparkfinancial.seed.transitjobs.example",
    title: "Junior Financial Analyst",
    category: "Finance",
    experienceLevel: "Entry",
    salaryMin: 48000,
    salaryMax: 56000,
    description: "Prepares monthly loan-performance reports and assists with underwriting file review.",
    applyUrl: "https://freedomparkfinancial.example/careers/junior-financial-analyst",
    addressText: "410 E Ponce de Leon Ave, Decatur, GA 30030",
    stationStopId: "510009", // DECATUR — BLUE
  },
  {
    contactEmail: "careers@freedomparkfinancial.seed.transitjobs.example",
    title: "Loan Servicing Specialist",
    category: "Finance",
    experienceLevel: "Mid",
    salaryMin: 44000,
    salaryMax: 52000,
    description: "Processes payments, escrow adjustments, and payoff requests for the consumer-lending book.",
    applyUrl: "https://freedomparkfinancial.example/careers/loan-servicing-specialist",
    addressText: "170 Grant St SE, Atlanta, GA 30315",
    stationStopId: "510021", // KING MEMORIAL — BLUE, GREEN
  },
  {
    contactEmail: "jobs@tracksidecoffee.seed.transitjobs.example",
    title: "Barista",
    category: "Food Service",
    experienceLevel: "Entry",
    salaryMin: 30000,
    salaryMax: 34000,
    description: "Handles espresso bar service and register during morning and midday rush at a downtown cafe.",
    applyUrl: "https://tracksidecoffee.example/careers/barista",
    addressText: "50 Upper Alabama St SW, Atlanta, GA 30303",
    stationStopId: "510015", // FIVE POINTS — BLUE, GOLD, GREEN, RED
  },
  {
    contactEmail: "jobs@tracksidecoffee.seed.transitjobs.example",
    title: "Roastery Production Lead",
    category: "Food Service",
    experienceLevel: "Mid",
    salaryMin: 42000,
    salaryMax: 50000,
    description: "Runs the daily roast schedule and quality checks at the company's small-batch roastery.",
    applyUrl: "https://tracksidecoffee.example/careers/roastery-production-lead",
    addressText: "1866 Moreland Ave NE, Atlanta, GA 30307",
    stationStopId: "510014", // EDGEWOOD-CANDLER PARK — BLUE, GREEN
  },
  {
    contactEmail: "careers@ironwoodlegal.seed.transitjobs.example",
    title: "Legal Assistant",
    category: "Legal",
    experienceLevel: "Entry",
    salaryMin: 38000,
    salaryMax: 44000,
    description: "Prepares filings and maintains case files for a small corporate and real-estate practice.",
    applyUrl: "https://ironwoodlegal.example/careers/legal-assistant",
    addressText: "1355 Peachtree St NE, Atlanta, GA 30309",
    stationStopId: "510001", // ARTS CENTER — GOLD, RED
  },
  {
    contactEmail: "careers@ironwoodlegal.seed.transitjobs.example",
    title: "Paralegal, Corporate",
    category: "Legal",
    experienceLevel: "Mid",
    salaryMin: 52000,
    salaryMax: 62000,
    description: "Drafts closing documents and manages diligence checklists for business-formation clients.",
    applyUrl: "https://ironwoodlegal.example/careers/paralegal-corporate",
    addressText: "1920 Donald Lee Hollowell Pkwy NW, Atlanta, GA 30318",
    stationStopId: "510004", // BANKHEAD — GREEN
  },
  {
    contactEmail: "jobs@magnoliacreative.seed.transitjobs.example",
    title: "Junior Graphic Designer",
    category: "Marketing",
    experienceLevel: "Entry",
    salaryMin: 40000,
    salaryMax: 46000,
    description: "Produces social and print assets for regional consumer-brand clients.",
    applyUrl: "https://magnoliacreative.example/careers/junior-graphic-designer",
    addressText: "931 Monroe Dr NE, Atlanta, GA 30308",
    stationStopId: "510026", // MIDTOWN — GOLD, RED
  },
  {
    contactEmail: "jobs@magnoliacreative.seed.transitjobs.example",
    title: "Account Manager",
    category: "Marketing",
    experienceLevel: "Mid",
    salaryMin: 54000,
    salaryMax: 64000,
    description: "Owns day-to-day client relationships and campaign timelines for three retail accounts.",
    applyUrl: "https://magnoliacreative.example/careers/account-manager",
    addressText: "755 Ralph David Abernathy Blvd SW, Atlanta, GA 30310",
    stationStopId: "510033", // WEST END — GOLD, RED
  },
  {
    contactEmail: "hiring@cottonrowmfg.seed.transitjobs.example",
    title: "Machine Operator",
    category: "Manufacturing",
    experienceLevel: "Entry",
    salaryMin: 35000,
    salaryMax: 40000,
    description: "Operates CNC stamping equipment on a rotating shift in a metal-fabrication shop.",
    applyUrl: "https://cottonrowmfg.example/careers/machine-operator",
    addressText: "3200 Peachtree Rd NE, Atlanta, GA 30305",
    stationStopId: "510036", // BUCKHEAD — RED
  },
  {
    contactEmail: "hiring@cottonrowmfg.seed.transitjobs.example",
    title: "Production Supervisor",
    category: "Manufacturing",
    experienceLevel: "Senior",
    salaryMin: 62000,
    salaryMax: 74000,
    description: "Leads a twelve-person fabrication shift and owns daily output and safety metrics.",
    applyUrl: "https://cottonrowmfg.example/careers/production-supervisor",
    addressText: "3450 Main St, College Park, GA 30337",
    stationStopId: "510008", // COLLEGE PARK — GOLD, RED
  },
  {
    contactEmail: "jobs@brightrailtech.seed.transitjobs.example",
    title: "Support Engineer",
    category: "Technology",
    experienceLevel: "Entry",
    salaryMin: 50000,
    salaryMax: 58000,
    description: "Triages customer tickets and reproduces bugs for a transit-scheduling SaaS product.",
    applyUrl: "https://brightrailtech.example/careers/support-engineer",
    addressText: "2400 Piedmont Rd NE, Atlanta, GA 30324",
    stationStopId: "510024", // LINDBERGH CENTER — GOLD, RED
  },
  {
    contactEmail: "jobs@brightrailtech.seed.transitjobs.example",
    title: "Backend Software Engineer",
    category: "Technology",
    experienceLevel: "Mid",
    salaryMin: 88000,
    salaryMax: 105000,
    description: "Builds and maintains scheduling APIs used by regional transit-operator customers.",
    applyUrl: "https://brightrailtech.example/careers/backend-software-engineer",
    addressText: "225 Peachtree Center Ave NE, Atlanta, GA 30303",
    stationStopId: "510040", // PEACHTREE CENTER — GOLD, RED
  },
  {
    contactEmail: "careers@harborlightinsurance.seed.transitjobs.example",
    title: "Claims Associate",
    category: "Insurance",
    experienceLevel: "Entry",
    salaryMin: 40000,
    salaryMax: 46000,
    description: "Reviews and processes property-claim submissions for residential policyholders.",
    applyUrl: "https://harborlightinsurance.example/careers/claims-associate",
    addressText: "420 E Ponce de Leon Ave, Decatur, GA 30030",
    stationStopId: "510009", // DECATUR — BLUE
  },
  {
    contactEmail: "careers@harborlightinsurance.seed.transitjobs.example",
    title: "Underwriting Analyst",
    category: "Insurance",
    experienceLevel: "Mid",
    salaryMin: 56000,
    salaryMax: 66000,
    description: "Evaluates renewal risk and pricing for the casualty book of business.",
    applyUrl: "https://harborlightinsurance.example/careers/underwriting-analyst",
    addressText: "160 Grant St SE, Atlanta, GA 30315",
    stationStopId: "510021", // KING MEMORIAL — BLUE, GREEN
  },
]

export type ContentSeedResult = {
  employerCount: number
  companyCount: number
  jobCount: number
  jobStationCount: number
}

/**
 * Writes the fictional employers, companies, jobs, and station associations
 * above, and is safe to run any number of times.
 *
 * Idempotence works the same way it does for `seedStations`: every id that
 * has no natural key of its own (companies, jobs) is derived deterministically
 * from stable content via `deterministicUuid`, so a rerun's inserts collide
 * with the previous run's rows on their primary key and update in place
 * instead of duplicating. Employer accounts are looked up by email — already
 * unique by the schema's `lower(email)` index — and only created once.
 */
export async function seedEmployersAndJobs(db: Database): Promise<ContentSeedResult> {
  const companyIdByEmail = new Map<string, string>()
  const employerIdByEmail = new Map<string, string>()

  for (const employer of FICTIONAL_EMPLOYERS) {
    const email = employer.contactEmail.toLowerCase()

    let owner = await db.query.users.findFirst({ where: eq(users.email, email) })
    if (!owner) {
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS)
      const [created] = await db
        .insert(users)
        .values({ email, passwordHash, role: "employer" })
        .returning()
      owner = created
    }
    if (!owner) {
      throw new Error(`Failed to create or find seed employer ${email}`)
    }
    employerIdByEmail.set(email, owner.id)

    const companyId = deterministicUuid(`company:${email}`)
    await db
      .insert(companies)
      .values({
        id: companyId,
        ownerId: owner.id,
        name: employer.companyName,
        websiteUrl: employer.websiteUrl,
        description: employer.description,
      })
      .onConflictDoUpdate({
        target: companies.id,
        set: {
          name: employer.companyName,
          websiteUrl: employer.websiteUrl,
          description: employer.description,
        },
      })
    companyIdByEmail.set(email, companyId)
  }

  const stationRows = await db.select().from(stations)
  const stationById = new Map(stationRows.map((station) => [station.stopId, station]))

  let jobStationCount = 0
  for (const [index, fixture] of JOB_FIXTURES.entries()) {
    const email = fixture.contactEmail.toLowerCase()
    const employerId = employerIdByEmail.get(email)
    const companyId = companyIdByEmail.get(email)
    if (!employerId || !companyId) {
      throw new Error(`Job fixture "${fixture.title}" references unknown employer ${email}`)
    }

    const station = stationById.get(fixture.stationStopId)
    if (!station) {
      throw new Error(
        `Job fixture "${fixture.title}" references unknown station ${fixture.stationStopId} — has seedStations run yet?`,
      )
    }

    const { bearingDegrees, distanceMiles } = pinOffsetFor(index)
    const pin = destinationPoint(station.location, bearingDegrees, distanceMiles)
    const walkMiles = distanceMiles.toFixed(2)
    const jobId = deterministicUuid(`job:${companyId}:${fixture.title}`)

    await db
      .insert(jobs)
      .values({
        id: jobId,
        employerId,
        companyId,
        title: fixture.title,
        description: fixture.description,
        category: fixture.category,
        experienceLevel: fixture.experienceLevel,
        salaryMin: fixture.salaryMin,
        salaryMax: fixture.salaryMax,
        addressText: fixture.addressText,
        location: pin,
        applyUrl: fixture.applyUrl,
        status: "published",
      })
      .onConflictDoUpdate({
        target: jobs.id,
        set: {
          title: fixture.title,
          description: fixture.description,
          category: fixture.category,
          experienceLevel: fixture.experienceLevel,
          salaryMin: fixture.salaryMin,
          salaryMax: fixture.salaryMax,
          addressText: fixture.addressText,
          location: pin,
          applyUrl: fixture.applyUrl,
          status: "published",
          updatedAt: new Date(),
        },
      })

    await db
      .insert(jobStations)
      .values({ jobId, stationId: fixture.stationStopId, walkMiles })
      .onConflictDoUpdate({
        target: [jobStations.jobId, jobStations.stationId],
        set: { walkMiles },
      })
    jobStationCount++
  }

  return {
    employerCount: FICTIONAL_EMPLOYERS.length,
    companyCount: FICTIONAL_EMPLOYERS.length,
    jobCount: JOB_FIXTURES.length,
    jobStationCount,
  }
}
