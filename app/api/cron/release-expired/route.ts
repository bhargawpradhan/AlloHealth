import { NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/inventory";

export const runtime = "nodejs";
export async function GET() {
  const released = await releaseExpiredReservations(500);

  return NextResponse.json({
    released,
    checkedAt: new Date().toISOString()
  });
}
