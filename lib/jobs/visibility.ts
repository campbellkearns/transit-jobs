import type { JobStatus } from "./types"

type VisibilityCheck = {
  status: JobStatus
  employerId: string
}

/**
 * A draft job is invisible to everyone except the employer who owns it —
 * the state model's rule (spec deliverable 7: "draft jobs 404 to
 * non-owners"). Published jobs are public, so this never depends on a
 * session existing. `getJobDetail` uses this to decide whether the caller
 * ever sees the row at all — a `false` here becomes a 404, not a 403, so a
 * non-owner can't distinguish "doesn't exist" from "exists but is a draft."
 */
export function isJobVisibleTo(job: VisibilityCheck, viewerId: string | undefined): boolean {
  return job.status === "published" || job.employerId === viewerId
}
