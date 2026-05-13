import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { loadReservationPayload, releaseExpiredReservations } from "@/lib/inventory";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await releaseExpiredReservations();

  const db = await getDb();
  const reservation = await loadReservationPayload(db, id);

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const totalAmountPaise = reservation.quantity * reservation.product.unitPricePaise;

  return NextResponse.json({
    reservation: {
      ...reservation,
      totalAmountPaise
    }
  });
}
