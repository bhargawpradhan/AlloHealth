import { NextRequest } from "next/server";
import { badRequest, conflict, gone, json, serviceUnavailable } from "@/lib/http";
import {
  confirmReservation,
  ExpiredReservationError,
  PaymentAlreadyUsedError,
  PaymentOrderMismatchError,
  PaymentOrderMissingError,
  ReservationStateError
} from "@/lib/inventory";
import {
  readIdempotencyResult,
  writeIdempotencyResult
} from "@/lib/idempotency";
import { isRazorpayConfigured, verifyRazorpaySignature } from "@/lib/razorpay";

export const runtime = "nodejs";

type PaymentPayload = {
  orderId: string;
  paymentId: string;
  signature: string;
};

function parsePaymentBody(body: unknown): PaymentPayload | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const orderId = (record.razorpay_order_id ?? record.razorpayOrderId) as string | undefined;
  const paymentId = (record.razorpay_payment_id ?? record.razorpayPaymentId) as
    | string
    | undefined;
  const signature = (record.razorpay_signature ?? record.razorpaySignature) as string | undefined;

  if (!orderId || !paymentId || !signature) {
    return null;
  }

  return { orderId, paymentId, signature };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cached = await readIdempotencyResult(request, `confirm:${id}`);
  if (cached) {
    return json(cached);
  }

  if (!isRazorpayConfigured()) {
    return serviceUnavailable(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }

  const body = await request.json().catch(() => null);
  const payment = parsePaymentBody(body);
  if (!payment) {
    return badRequest(
      "Razorpay payment fields are required: razorpay_order_id, razorpay_payment_id, razorpay_signature"
    );
  }

  if (!verifyRazorpaySignature(payment.orderId, payment.paymentId, payment.signature)) {
    return badRequest("Invalid Razorpay payment signature");
  }

  try {
    const reservation = await confirmReservation(id, {
      orderId: payment.orderId,
      paymentId: payment.paymentId
    });
    const result = {
      status: 200,
      body: { reservation }
    };

    await writeIdempotencyResult(request, `confirm:${id}`, result);
    return json(result);
  } catch (error) {
    if (error instanceof ExpiredReservationError) {
      return gone(error.message);
    }

    if (error instanceof ReservationStateError) {
      return badRequest(error.message);
    }

    if (error instanceof PaymentOrderMissingError || error instanceof PaymentOrderMismatchError) {
      return badRequest(error.message);
    }

    if (error instanceof PaymentAlreadyUsedError) {
      return conflict(error.message);
    }

    throw error;
  }
}
