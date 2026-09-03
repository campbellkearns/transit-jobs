import { z } from "zod"

/**
 * Shared job input schema for both create and edit. The employer form saves
 * its full local state on every submit (single-column, four-section form —
 * UI direction art_cJdHuq28), so create and edit take identical payloads;
 * edit simply replaces the job's fields and station associations wholesale.
 */

const pinSchema = z.object({
  lng: z
    .number()
    .gte(-180, "Pin longitude is out of range.")
    .lte(180, "Pin longitude is out of range."),
  lat: z
    .number()
    .gte(-90, "Pin latitude is out of range.")
    .lte(90, "Pin latitude is out of range."),
})

const stationAssociationSchema = z.object({
  stationId: z.string().trim().min(1, "Station id is required."),
  // Mirrors the `job_stations_walk_miles_within_one` check constraint so a
  // bad claim comes back as a friendly 400 instead of a raw constraint
  // violation surfacing from Postgres.
  walkMiles: z
    .number()
    .gt(0, "Walk distance must be greater than 0 miles.")
    .lte(1, "Walk distance claims are capped at 1.00 mile."),
})

export const jobInputSchema = z
  .object({
    title: z.string().trim().min(1, "Job title is required."),
    description: z.string().trim().min(1, "Job description is required."),
    category: z.string().trim().min(1, "Category is required."),
    experienceLevel: z.string().trim().min(1, "Experience level is required."),
    salaryMin: z.number().int().nonnegative().nullable().optional(),
    salaryMax: z.number().int().nonnegative().nullable().optional(),
    addressText: z.string().trim().min(1, "Office address is required."),
    pin: pinSchema,
    applyUrl: z
      .string()
      .trim()
      .url("Enter a valid application URL.")
      .nullable()
      .optional(),
    stations: z
      .array(stationAssociationSchema)
      .min(1, "Select at least one station.")
      .refine(
        (stations) => new Set(stations.map((station) => station.stationId)).size === stations.length,
        { message: "Each station can only be selected once." },
      ),
  })
  .refine((job) => job.salaryMin == null || job.salaryMax == null || job.salaryMin <= job.salaryMax, {
    message: "Minimum salary can't exceed maximum salary.",
    path: ["salaryMin"],
  })

export type JobInput = z.infer<typeof jobInputSchema>
