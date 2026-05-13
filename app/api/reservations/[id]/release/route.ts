import { NextRequest } from "next/server";
import { badRequest, json } from "@/lib/http";
import {
  releaseReservation,
  ReservationStateError
} from "@/lib/inventory";
import {
  readIdempotencyResult,
  writeIdempotencyResult
} from "@/lib/idempotency";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cached = await readIdempotencyResult(request, `release:${id}`);
  if (cached) {
    return json(cached);
  }

  try {
    const reservation = await releaseReservation(id);
    const result = {
      status: 200,
      body: { reservation }
    };

    await writeIdempotencyResult(request, `release:${id}`, result);
    return json(result);
  } catch (error) {
    if (error instanceof ReservationStateError) {
      return badRequest(error.message);
    }

    throw error;
  }
}
