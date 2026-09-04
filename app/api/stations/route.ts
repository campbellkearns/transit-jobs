import { NextResponse } from "next/server"
import { listStations } from "@/lib/stations"

/** Public station list — feeds the employer StationPicker (T4). */
export async function GET() {
  const stations = await listStations()
  return NextResponse.json({ stations })
}
