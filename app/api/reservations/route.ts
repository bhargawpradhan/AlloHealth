import { NextRequest } from "next/server";
import { badRequest, conflict, json } from "@/lib/http";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  InsufficientStockError,
  loadReservationPayload,
  releaseExpiredReservations,
  reserveInventory
} from "@/lib/inventory";
import {
  readIdempotencyResult,
  writeIdempotencyResult
} from "@/lib/idempotency";

export const runtime = "nodejs";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  await releaseExpiredReservations();

  const db = await getDb();
  const rows = await db
    .collection<{ _id: string; createdAt: Date }>(COLLECTIONS.reservations)
    .find({})
    .sort({ createdAt: -1 })
    .limit(16)
    .toArray();

  const reservations = (
    await Promise.all(
      rows.map(async (row) => {
        const reservation = await loadReservationPayload(db, row._id);
        if (!reservation) {
          return null;
        }

        return {
          ...reservation,
          totalAmountPaise: reservation.quantity * reservation.product.unitPricePaise
        };
      })
    )
  ).filter(Boolean);

  return json({
    status: 200,
    body: {
      reservations
    }
  });
}

export async function POST(request: NextRequest) {
  const cached = await readIdempotencyResult(request, "create-reservation");
  if (cached) {
    return json(cached);
  }

  const body = await request.json().catch(() => null);
  const productId = body?.productId;
  const warehouseId = body?.warehouseId;
  const quantity = Number(body?.quantity ?? 1);
  const customer = {
    name: cleanText(body?.customer?.name),
    email: cleanText(body?.customer?.email).toLowerCase(),
    phone: cleanText(body?.customer?.phone)
  };

  if (!productId || !warehouseId || !Number.isInteger(quantity) || quantity < 1) {
    return badRequest("productId, warehouseId and a positive integer quantity are required");
  }

  if (!customer.name || !customer.email || !customer.phone) {
    return badRequest("Customer name, email and phone are required");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return badRequest("A valid customer email is required");
  }

  await releaseExpiredReservations();

  try {
    const reservation = await reserveInventory({ productId, warehouseId, quantity, customer });
    const result = {
      status: 201,
      body: {
        reservation
      }
    };

    await writeIdempotencyResult(request, "create-reservation", result);
    return json(result);
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return conflict(error.message);
    }

    throw error;
  }
}
