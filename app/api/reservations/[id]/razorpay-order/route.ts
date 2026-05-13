import { NextRequest } from "next/server";
import { badRequest, gone, json, serviceUnavailable } from "@/lib/http";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { loadReservationPayload, releaseExpiredReservations } from "@/lib/inventory";
import { getRazorpayClient, isRazorpayConfigured } from "@/lib/razorpay";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isRazorpayConfigured()) {
    return serviceUnavailable(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }

  const { id } = await params;
  await releaseExpiredReservations();

  const db = await getDb();
  const reservation = await loadReservationPayload(db, id);

  if (!reservation) {
    return badRequest("Reservation not found");
  }

  if (reservation.status !== "pending") {
    return badRequest("Only pending reservations can start payment");
  }

  if (reservation.expiresAt <= new Date()) {
    return gone("Reservation expired");
  }

  const amountPaise = reservation.quantity * reservation.product.unitPricePaise;
  if (amountPaise < 100) {
    return badRequest("Order amount must be at least 100 paise (₹1) for Razorpay");
  }

  let order: { id: string; amount: number; currency: string };
  try {
    const client = getRazorpayClient();
    const created = await client.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40),
      notes: {
        reservationId: id,
        productId: reservation.productId
      }
    });
    order = {
      id: created.id,
      amount: Number(created.amount),
      currency: String(created.currency)
    };
  } catch (error) {
    console.error("Razorpay order creation failed", error);
    return badRequest(
      "Unable to create Razorpay order. Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }

  await db.collection<{ _id: string }>(COLLECTIONS.reservations).updateOne(
    { _id: id },
    { $set: { razorpayOrderId: order.id, updatedAt: new Date() } }
  );

  return json({
    status: 200,
    body: {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      reservationId: id,
      quantity: reservation.quantity,
      unit: reservation.product.unit,
      unitPricePaise: reservation.product.unitPricePaise
    }
  });
}
