"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { toast } from "sonner";

const FALLBACK_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80";

type Reservation = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: "pending" | "confirmed" | "released";
  expiresAt: string;
  createdAt: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  totalAmountPaise?: number;
  customer: {
    name: string;
    email: string;
    phone: string;
  } | null;
  product: {
    name: string;
    imageUrl: string;
    unit: string;
    unitPricePaise: number;
  };
  warehouse: {
    name: string;
    location: string;
  };
};

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Unable to load Razorpay")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay"));
    document.body.appendChild(script);
  });
}

export default function ReservationPage() {
  const params = useParams<{ id: string }>();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"confirm" | "release" | null>(null);
  const [now, setNow] = useState(Date.now());
  const [errorPulse, setErrorPulse] = useState(false);
  const [imageSrc, setImageSrc] = useState(FALLBACK_PRODUCT_IMAGE);
  const confirmIdempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadReservation = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reservations/${params.id}`, {
        cache: "no-store"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load reservation");
      }

      setReservation(data.reservation);
      setImageSrc(data.reservation?.product?.imageUrl || FALLBACK_PRODUCT_IMAGE);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load reservation");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadReservation();
  }, [loadReservation]);

  const remainingMs = useMemo(() => {
    if (!reservation) {
      return 0;
    }

    return Math.max(0, new Date(reservation.expiresAt).getTime() - now);
  }, [now, reservation]);

  const countdown = useMemo(() => {
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingMs]);

  const formattedTotal = useMemo(() => {
    if (!reservation) {
      return "";
    }

    return ((reservation.totalAmountPaise ?? reservation.quantity * reservation.product.unitPricePaise) /
      100
    ).toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    });
  }, [reservation]);

  async function startRazorpayCheckout() {
    if (!reservation) {
      return;
    }

    setAction("confirm");
    setErrorPulse(false);

    try {
      const orderResponse = await fetch(`/api/reservations/${reservation.id}/razorpay-order`, {
        method: "POST"
      });
      const orderPayload = await orderResponse.json();

      if (orderResponse.status === 503) {
        throw new Error(orderPayload.error ?? "Razorpay is not configured on the server.");
      }

      if (!orderResponse.ok) {
        throw new Error(orderPayload.error ?? "Unable to start Razorpay checkout");
      }

      const { orderId, amount, currency, keyId } = orderPayload as {
        orderId: string;
        amount: number;
        currency: string;
        keyId: string;
      };

      await loadRazorpayScript();
      const RazorpayCtor = window.Razorpay;
      if (!RazorpayCtor) {
        throw new Error("Razorpay failed to initialize");
      }

      confirmIdempotencyKey.current = crypto.randomUUID();

      const checkout = new RazorpayCtor({
        key: keyId,
        amount: Number(amount),
        currency,
        order_id: orderId,
        name: "Aegis Checkout",
        description: `${reservation.quantity} ${reservation.product.unit} · ${reservation.product.name}`,
        prefill: reservation.customer
          ? {
              name: reservation.customer.name,
              email: reservation.customer.email,
              contact: reservation.customer.phone
            }
          : undefined,
        theme: { color: "#22d3ee" },
        handler: async (paymentResponse: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const response = await fetch(`/api/reservations/${reservation.id}/confirm`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": confirmIdempotencyKey.current ?? crypto.randomUUID()
              },
              body: JSON.stringify({
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature
              })
            });
            const data = await response.json();

            if (response.status === 410) {
              setErrorPulse(true);
              toast.error(data.error ?? "Reservation expired and stock was released.");
              setReservation((current) =>
                current ? { ...current, status: "released" } : current
              );
              return;
            }

            if (!response.ok) {
              throw new Error(data.error ?? "Unable to confirm payment");
            }

            setReservation(data.reservation);
            toast.success("Razorpay payment verified. Inventory captured.");
          } catch (error) {
            setErrorPulse(true);
            toast.error(error instanceof Error ? error.message : "Unable to confirm payment");
          } finally {
            setAction(null);
          }
        },
        modal: {
          ondismiss: () => {
            setAction(null);
          }
        }
      });

      checkout.open();
    } catch (error) {
      setErrorPulse(true);
      toast.error(error instanceof Error ? error.message : "Unable to start payment");
      setAction(null);
    }
  }

  async function releaseHold() {
    if (!reservation) {
      return;
    }

    setAction("release");
    setErrorPulse(false);

    try {
      const response = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID()
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Reservation update failed");
      }

      setReservation(data.reservation);
      toast.success("Reservation released.");
    } catch (error) {
      setErrorPulse(true);
      toast.error(error instanceof Error ? error.message : "Reservation update failed");
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-5 pt-28">
        <div className="glass-panel rounded-lg p-8">
          <Loader2 className="h-8 w-8 animate-spin text-cyanGlow" />
        </div>
      </main>
    );
  }

  if (!reservation) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-5 pt-28">
        <div className="glass-panel rounded-lg p-8 text-center">
          <p className="text-lg text-white">Reservation not found.</p>
          <Link className="mt-4 inline-flex text-cyanGlow" href="/">
            Back to inventory
          </Link>
        </div>
      </main>
    );
  }

  const expired = remainingMs <= 0 && reservation.status === "pending";
  const pending = reservation.status === "pending" && !expired;

  return (
    <main className="relative min-h-screen overflow-hidden px-5 pb-8 pt-32 sm:px-8">
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm text-white transition hover:border-cyanGlow/50"
        >
          <ArrowLeft className="h-4 w-4" />
          Inventory
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 22, rotateX: -4 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          className={`glass-panel holo-border water-card grid overflow-hidden rounded-lg lg:grid-cols-[1.05fr_0.95fr] ${
            errorPulse ? "animate-shake shadow-danger" : "shadow-neon"
          }`}
        >
          <div className="relative min-h-[360px]">
            <Image
              src={imageSrc}
              alt={reservation.product.name}
              fill
              priority
              unoptimized
              onError={() => setImageSrc(FALLBACK_PRODUCT_IMAGE)}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-void via-void/15 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <p className="mb-2 inline-flex rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-3 py-1 text-sm text-cyan-100">
                Reservation {reservation.status}
              </p>
              <h1 className="text-4xl font-semibold text-white">
                {reservation.product.name}
              </h1>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 text-slate-300">
              <ShieldCheck className="h-5 w-5 text-acid" />
              Row-locked hold · Razorpay Standard Checkout
            </div>

            <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.06] p-6 text-center">
              <Clock3 className="mx-auto h-8 w-8 text-cyanGlow" />
              <div className="mt-3 font-mono text-6xl font-semibold text-white">
                {reservation.status === "pending" ? countdown : "00:00"}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {pending
                  ? "Time remaining before automatic release"
                  : reservation.status === "confirmed"
                    ? "Confirmed reservation"
                    : "Released reservation"}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-white/10 bg-white/[0.05] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Quantity</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {reservation.quantity}{" "}
                  <span className="text-base font-medium text-slate-400">
                    {reservation.product.unit}
                  </span>
                </p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.05] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Warehouse</p>
                <p className="mt-2 flex items-center gap-2 text-white">
                  <MapPin className="h-4 w-4 text-violetGlow" />
                  {reservation.warehouse.name}
                </p>
                <p className="mt-1 text-sm text-slate-400">{reservation.warehouse.location}</p>
              </div>
            </div>

            {reservation.customer ? (
              <div className="mt-4 rounded-md border border-white/10 bg-white/[0.05] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Reserved for</p>
                <p className="mt-2 text-lg font-semibold text-white">{reservation.customer.name}</p>
                <div className="mt-2 grid gap-1 text-sm text-slate-400 sm:grid-cols-2">
                  <span>{reservation.customer.email}</span>
                  <span>{reservation.customer.phone}</span>
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-md border border-cyanGlow/25 bg-cyanGlow/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Checkout total</p>
              <p className="mt-2 text-3xl font-semibold text-white">{formattedTotal}</p>
              <p className="mt-1 text-xs text-slate-400">
                {(reservation.product.unitPricePaise / 100).toLocaleString("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 2
                })}{" "}
                × {reservation.quantity} {reservation.product.unit}
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                disabled={!pending || action !== null}
                onClick={startRazorpayCheckout}
                className="ripple-button inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-acid to-cyanGlow px-4 py-3 font-semibold text-void shadow-neon transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {action === "confirm" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CreditCard className="h-5 w-5" />
                )}
                Pay with Razorpay
              </button>
              <button
                disabled={reservation.status !== "pending" || action !== null}
                onClick={releaseHold}
                className="ripple-button inline-flex items-center justify-center gap-2 rounded-md border border-rose-300/40 bg-rose-400/10 px-4 py-3 font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {action === "release" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                Cancel hold
              </button>
            </div>

            {reservation.status === "confirmed" && reservation.razorpayPaymentId ? (
              <p className="mt-4 flex items-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Payment {reservation.razorpayPaymentId} recorded against this reservation.
              </p>
            ) : null}

            {expired ? (
              <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                This reservation has expired. Confirming now returns HTTP 410 and releases stock.
              </p>
            ) : null}
          </div>
        </motion.div>
      </section>
    </main>
  );
}
