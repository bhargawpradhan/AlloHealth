"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  IndianRupee,
  Loader2,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  PlusCircle,
  RefreshCw,
  Sparkles,
  UserRound,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api-client";

type Product = {
  id: string;
  name: string;
  imageUrl: string;
  unit: string;
  unitPricePaise: number;
  warehouses: WarehouseStock[];
};

type WarehouseStock = {
  warehouseId: string;
  warehouseName: string;
  location: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
};

type Warehouse = {
  id: string;
  name: string;
  location: string;
};

type ReservationSummary = {
  id: string;
  quantity: number;
  status: "pending" | "confirmed" | "released";
  releaseReason: "cancelled" | "expired" | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  totalAmountPaise: number;
  customer: {
    name: string;
    email: string;
    phone: string;
  } | null;
  product: {
    name: string;
    unit: string;
    unitPricePaise: number;
  };
  warehouse: {
    name: string;
    location: string;
  };
};

const FALLBACK_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80";

export default function ProductListingPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [reservations, setReservations] = useState<ReservationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [addingWarehouse, setAddingWarehouse] = useState(false);
  const [addingInventory, setAddingInventory] = useState(false);
  const [reservingKey, setReservingKey] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [errorPulse, setErrorPulse] = useState<string | null>(null);
  const [quantityByKey, setQuantityByKey] = useState<Record<string, number>>({});
  const [imageByProductId, setImageByProductId] = useState<Record<string, string>>({});
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: ""
  });
  const [inventoryForm, setInventoryForm] = useState({
    name: "",
    imageUrl: "",
    unit: "pcs",
    unitPriceRupees: "999",
    warehouseId: "",
    quantity: "10"
  });
  const [warehouseForm, setWarehouseForm] = useState({
    name: "",
    location: ""
  });

  async function loadProducts() {
    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/products"), { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        products?: Product[];
        error?: string;
        hint?: string;
      };

      if (!response.ok) {
        const detail = [data.error, data.hint].filter(Boolean).join(" — ");
        throw new Error(detail || "Unable to load products");
      }

      setProducts(data.products ?? []);
      setImageByProductId(
        Object.fromEntries(
          (data.products ?? []).map((product) => [
            product.id,
            product.imageUrl || FALLBACK_PRODUCT_IMAGE
          ])
        )
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load products");
    } finally {
      setLoading(false);
    }
  }

  async function loadReservations() {
    setReservationsLoading(true);
    try {
      const response = await fetch(apiUrl("/api/reservations"), { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        reservations?: ReservationSummary[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load reservations");
      }

      setReservations(data.reservations ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load reservations");
    } finally {
      setReservationsLoading(false);
    }
  }

  async function loadWarehouses() {
    try {
      const response = await fetch(apiUrl("/api/warehouses"), { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        warehouses?: Warehouse[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load warehouses");
      }

      const nextWarehouses = data.warehouses ?? [];
      setWarehouses(nextWarehouses);
      setInventoryForm((current) => ({
        ...current,
        warehouseId: current.warehouseId || nextWarehouses[0]?.id || ""
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load warehouses");
    }
  }

  useEffect(() => {
    loadProducts();
    loadWarehouses();
    loadReservations();
  }, []);

  const totalAvailable = useMemo(
    () =>
      products.reduce(
        (sum, product) =>
          sum + product.warehouses.reduce((inner, stock) => inner + stock.availableStock, 0),
        0
      ),
    [products]
  );

  const reservationCounts = useMemo(
    () =>
      reservations.reduce(
        (counts, reservation) => {
          if (reservation.status === "pending") {
            counts.pending += 1;
          } else if (reservation.status === "released" && reservation.releaseReason === "expired") {
            counts.expired += 1;
          } else if (reservation.status === "released") {
            counts.cancelled += 1;
          }
          return counts;
        },
        { pending: 0, cancelled: 0, expired: 0 }
      ),
    [reservations]
  );

  async function refreshDashboard() {
    await Promise.all([loadProducts(), loadReservations()]);
  }

  async function reserve(product: Product, stock: WarehouseStock) {
    const key = `${product.id}:${stock.warehouseId}`;
    const requested = quantityByKey[key] ?? 1;
    const quantity = Math.min(Math.max(1, Math.floor(requested)), stock.availableStock);
    const trimmedCustomer = {
      name: customer.name.trim(),
      email: customer.email.trim(),
      phone: customer.phone.trim()
    };

    if (!trimmedCustomer.name || !trimmedCustomer.email || !trimmedCustomer.phone) {
      setErrorPulse(key);
      toast.error("Add the customer details before reserving inventory.");
      return;
    }

    setReservingKey(key);
    setErrorPulse(null);

    try {
      const response = await fetch(apiUrl("/api/reservations"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: stock.warehouseId,
          quantity,
          customer: trimmedCustomer
        })
      });
      const data = await response.json();

      if (response.status === 409) {
        setErrorPulse(key);
        toast.error("That unit was just claimed. Stock refreshed.");
        await loadProducts();
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Reservation failed");
      }

      toast.success("Reservation locked for 10 minutes");
      router.push(`/reservations/${data.reservation.id}`);
    } catch (error) {
      setErrorPulse(key);
      toast.error(error instanceof Error ? error.message : "Reservation failed");
    } finally {
      setReservingKey(null);
    }
  }

  async function cancelReservation(reservationId: string) {
    setReleasingId(reservationId);
    try {
      const response = await fetch(apiUrl(`/api/reservations/${reservationId}/release`), {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID()
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to cancel reservation");
      }

      toast.success("Reservation cancelled and stock returned.");
      await refreshDashboard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel reservation");
    } finally {
      setReleasingId(null);
    }
  }

  async function addInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddingInventory(true);

    try {
      const response = await fetch(apiUrl("/api/products"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: inventoryForm.name,
          imageUrl: inventoryForm.imageUrl,
          unit: inventoryForm.unit,
          unitPriceRupees: inventoryForm.unitPriceRupees,
          warehouseId: inventoryForm.warehouseId,
          quantity: Number(inventoryForm.quantity)
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to add inventory");
      }

      toast.success(`Added ${data.addedQuantity} ${inventoryForm.unit} to inventory`);
      setInventoryForm((current) => ({
        ...current,
        name: "",
        imageUrl: "",
        quantity: "10"
      }));
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add inventory");
    } finally {
      setAddingInventory(false);
    }
  }

  async function addWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddingWarehouse(true);

    try {
      const response = await fetch(apiUrl("/api/warehouses"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(warehouseForm)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to add warehouse");
      }

      toast.success("Warehouse ready for inventory");
      setWarehouseForm({ name: "", location: "" });
      await loadWarehouses();
      setInventoryForm((current) => ({
        ...current,
        warehouseId: data.warehouse?.id ?? current.warehouseId
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add warehouse");
    } finally {
      setAddingWarehouse(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-5 pb-8 pt-32 sm:px-8 lg:px-12">
      <section className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-4 py-2 text-sm text-cyan-100">
              <Sparkles className="h-4 w-4" />
              Race-safe checkout infrastructure
            </div>
            <h1 className="text-4xl font-semibold tracking-normal text-white sm:text-6xl">
              Aegis Inventory Reservations
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Reserve stock during checkout with Postgres row locks, 10-minute holds,
              expiry cleanup, and MongoDB-backed idempotency for repeat-safe requests.
            </p>
          </div>

          <div className="glass-panel holo-border water-card rounded-lg p-5">
            <div className="flex items-center gap-3 text-slate-300">
              <Boxes className="h-5 w-5 text-cyanGlow" />
              Available across grid
            </div>
            <div className="mt-2 text-4xl font-semibold text-white">{totalAvailable}</div>
          </div>
        </header>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-400">
            Warehouse counts reflect lazy expiry cleanup before each read.
          </p>
          <button
            onClick={refreshDashboard}
            className="ripple-button inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm text-white transition hover:border-cyanGlow/50 hover:bg-cyanGlow/10"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <section id="reserve" className="glass-panel water-card scroll-mt-28 rounded-lg p-5">
          <div className="flex items-center gap-3 text-white">
            <UserRound className="h-5 w-5 text-acid" />
            <h2 className="text-lg font-semibold">Reserve for customer</h2>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                <UserRound className="h-3.5 w-3.5" />
                Name
              </span>
              <input
                value={customer.name}
                onChange={(event) =>
                  setCustomer((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Customer name"
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 placeholder:text-slate-600 focus:ring-2"
              />
            </label>
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                <Mail className="h-3.5 w-3.5" />
                Email
              </span>
              <input
                type="email"
                value={customer.email}
                onChange={(event) =>
                  setCustomer((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="customer@example.com"
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 placeholder:text-slate-600 focus:ring-2"
              />
            </label>
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                <Phone className="h-3.5 w-3.5" />
                Phone
              </span>
              <input
                type="tel"
                value={customer.phone}
                onChange={(event) =>
                  setCustomer((current) => ({ ...current, phone: event.target.value }))
                }
                placeholder="+91 98765 43210"
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 placeholder:text-slate-600 focus:ring-2"
              />
            </label>
          </div>
        </section>

        <section id="add-stock" className="glass-panel water-card scroll-mt-28 rounded-lg p-5">
          <div className="flex items-center gap-3 text-white">
            <PlusCircle className="h-5 w-5 text-cyanGlow" />
            <h2 className="text-lg font-semibold">Add inventory</h2>
          </div>
          <form onSubmit={addWarehouse} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Warehouse
              </span>
              <input
                value={warehouseForm.name}
                onChange={(event) =>
                  setWarehouseForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Warehouse name"
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 placeholder:text-slate-600 focus:ring-2"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Location
              </span>
              <input
                value={warehouseForm.location}
                onChange={(event) =>
                  setWarehouseForm((current) => ({ ...current, location: event.target.value }))
                }
                placeholder="City, region"
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 placeholder:text-slate-600 focus:ring-2"
              />
            </label>
            <button
              disabled={addingWarehouse}
              className="ripple-button inline-flex items-center justify-center gap-2 self-end rounded-md border border-cyanGlow/35 bg-cyanGlow/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyanGlow/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {addingWarehouse ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              Add warehouse
            </button>
          </form>
          <form onSubmit={addInventory} className="mt-4 grid gap-3 lg:grid-cols-6">
            <label className="space-y-2 lg:col-span-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Product
              </span>
              <input
                value={inventoryForm.name}
                onChange={(event) =>
                  setInventoryForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Product name"
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 placeholder:text-slate-600 focus:ring-2"
              />
            </label>
            <label className="space-y-2 lg:col-span-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Image URL
              </span>
              <input
                value={inventoryForm.imageUrl}
                onChange={(event) =>
                  setInventoryForm((current) => ({ ...current, imageUrl: event.target.value }))
                }
                placeholder="Optional product image"
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 placeholder:text-slate-600 focus:ring-2"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">Unit</span>
              <input
                value={inventoryForm.unit}
                onChange={(event) =>
                  setInventoryForm((current) => ({ ...current, unit: event.target.value }))
                }
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 focus:ring-2"
              />
            </label>
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                <IndianRupee className="h-3.5 w-3.5" />
                Price
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={inventoryForm.unitPriceRupees}
                onChange={(event) =>
                  setInventoryForm((current) => ({
                    ...current,
                    unitPriceRupees: event.target.value
                  }))
                }
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 focus:ring-2"
              />
            </label>
            <label className="space-y-2 lg:col-span-2">
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                <MapPin className="h-3.5 w-3.5" />
                Warehouse
              </span>
              <select
                value={inventoryForm.warehouseId}
                onChange={(event) =>
                  setInventoryForm((current) => ({
                    ...current,
                    warehouseId: event.target.value
                  }))
                }
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 focus:ring-2"
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id} className="bg-void text-white">
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Quantity
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={inventoryForm.quantity}
                onChange={(event) =>
                  setInventoryForm((current) => ({ ...current, quantity: event.target.value }))
                }
                className="w-full rounded-md border border-white/15 bg-void/60 px-3 py-2 text-sm text-white outline-none ring-cyanGlow/40 focus:ring-2"
              />
            </label>
            <button
              disabled={addingInventory || warehouses.length === 0}
              className="ripple-button inline-flex items-center justify-center gap-2 self-end rounded-md bg-gradient-to-r from-acid to-cyanGlow px-4 py-2 text-sm font-semibold text-void shadow-neon transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {addingInventory ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlusCircle className="h-4 w-4" />
              )}
              Add stock
            </button>
          </form>
        </section>

        <section id="activity" className="glass-panel water-card scroll-mt-28 rounded-lg p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3 text-white">
                <Clock3 className="h-5 w-5 text-cyanGlow" />
                <h2 className="text-lg font-semibold">Reservation activity</h2>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Recent reserved products, cancelled holds, and timed-out releases.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-cyanGlow/25 bg-cyanGlow/10 px-3 py-2">
                <p className="text-lg font-semibold text-white">{reservationCounts.pending}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100">Reserved</p>
              </div>
              <div className="rounded-md border border-rose-300/25 bg-rose-400/10 px-3 py-2">
                <p className="text-lg font-semibold text-white">{reservationCounts.cancelled}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-rose-100">Cancelled</p>
              </div>
              <div className="rounded-md border border-amber-300/25 bg-amber-400/10 px-3 py-2">
                <p className="text-lg font-semibold text-white">{reservationCounts.expired}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100">Timeout</p>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-md border border-white/10">
            {reservationsLoading ? (
              <div className="flex min-h-32 items-center justify-center bg-white/[0.04]">
                <Loader2 className="h-6 w-6 animate-spin text-cyanGlow" />
              </div>
            ) : reservations.length === 0 ? (
              <div className="bg-white/[0.04] px-4 py-8 text-center text-sm text-slate-400">
                No reservations yet.
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {reservations.map((reservation) => {
                  const isPending = reservation.status === "pending";
                  const isCancelled =
                    reservation.status === "released" && reservation.releaseReason !== "expired";
                  const isExpired =
                    reservation.status === "released" && reservation.releaseReason === "expired";
                  const statusLabel = isPending
                    ? "Reserved"
                    : isExpired
                      ? "Timeout"
                      : isCancelled
                        ? "Cancelled"
                        : "Confirmed";
                  const statusClass = isPending
                    ? "border-cyanGlow/30 bg-cyanGlow/10 text-cyan-100"
                    : isExpired
                      ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
                      : isCancelled
                        ? "border-rose-300/30 bg-rose-400/10 text-rose-100"
                        : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";

                  return (
                    <div
                      key={reservation.id}
                      className="grid gap-4 bg-white/[0.04] p-4 lg:grid-cols-[1.2fr_0.9fr_0.75fr_auto] lg:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}
                          >
                            {isPending ? (
                              <Clock3 className="h-3.5 w-3.5" />
                            ) : reservation.status === "confirmed" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                            {statusLabel}
                          </span>
                          <Link
                            href={`/reservations/${reservation.id}`}
                            className="text-sm font-semibold text-white transition hover:text-cyanGlow"
                          >
                            {reservation.product.name}
                          </Link>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">
                          {reservation.quantity} {reservation.product.unit} from{" "}
                          {reservation.warehouse.name}
                        </p>
                      </div>

                      <div className="text-sm">
                        <p className="font-medium text-white">
                          {reservation.customer?.name ?? "Customer unavailable"}
                        </p>
                        <p className="mt-1 text-slate-400">{reservation.customer?.phone}</p>
                      </div>

                      <div className="text-sm text-slate-400">
                        <p>
                          {isPending ? "Expires" : "Updated"}{" "}
                          {new Date(
                            isPending ? reservation.expiresAt : reservation.updatedAt
                          ).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short"
                          })}
                        </p>
                        <p className="mt-1 text-white">
                          {(reservation.totalAmountPaise / 100).toLocaleString("en-IN", {
                            style: "currency",
                            currency: "INR",
                            maximumFractionDigits: 2
                          })}
                        </p>
                      </div>

                      <button
                        disabled={!isPending || releasingId === reservation.id}
                        onClick={() => cancelReservation(reservation.id)}
                        className="ripple-button inline-flex items-center justify-center gap-2 rounded-md border border-rose-300/35 bg-rose-400/10 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {releasingId === reservation.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        Cancel
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <div className="glass-panel flex min-h-[360px] items-center justify-center rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-cyanGlow" />
          </div>
        ) : (
          <div id="products" className="grid scroll-mt-28 gap-6 lg:grid-cols-3">
            {products.map((product, index) => (
              <motion.article
                key={product.id}
                initial={{ opacity: 0, y: 24, rotateX: -6 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ delay: index * 0.08, duration: 0.55 }}
                className="glass-panel water-card preserve-3d rounded-lg p-4 shadow-neon transition duration-300"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-md">
                  <Image
                    src={imageByProductId[product.id] ?? product.imageUrl ?? FALLBACK_PRODUCT_IMAGE}
                    alt={product.name}
                    fill
                    unoptimized
                    onError={() =>
                      setImageByProductId((current) => ({
                        ...current,
                        [product.id]: FALLBACK_PRODUCT_IMAGE
                      }))
                    }
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <h2 className="text-2xl font-semibold text-white">{product.name}</h2>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {product.warehouses.map((stock) => {
                    const key = `${product.id}:${stock.warehouseId}`;
                    const isBusy = reservingKey === key;
                    const isError = errorPulse === key;
                    const soldOut = stock.availableStock <= 0;
                    const selectedQty = Math.min(
                      Math.max(1, quantityByKey[key] ?? 1),
                      stock.availableStock
                    );
                    const lineTotalPaise = selectedQty * product.unitPricePaise;

                    return (
                      <div
                        key={stock.warehouseId}
                        className={`rounded-md border border-white/10 bg-white/[0.06] p-4 ${
                          isError ? "animate-shake shadow-danger" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 font-medium text-white">
                              <MapPin className="h-4 w-4 text-violetGlow" />
                              {stock.warehouseName}
                            </div>
                            <p className="mt-1 text-sm text-slate-400">{stock.location}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-semibold text-cyan-100">
                              {stock.availableStock}
                            </div>
                            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                              available
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyanGlow via-violetGlow to-acid"
                            style={{
                              width: `${Math.max(
                                5,
                                Math.min(100, (stock.availableStock / Math.max(stock.totalStock, 1)) * 100)
                              )}%`
                            }}
                          />
                        </div>

                        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                          <span>Total {stock.totalStock}</span>
                          <span>Reserved {stock.reservedStock}</span>
                        </div>

                        <div className="mt-4 space-y-2 rounded-md border border-white/10 bg-white/[0.04] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <label className="text-xs uppercase tracking-[0.22em] text-slate-500">
                              Units ({product.unit})
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={stock.availableStock}
                              value={selectedQty}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                setQuantityByKey((prev) => ({
                                  ...prev,
                                  [key]: Number.isFinite(next)
                                    ? Math.min(Math.max(1, Math.floor(next)), stock.availableStock)
                                    : 1
                                }));
                              }}
                              className="w-24 rounded-md border border-white/15 bg-void/60 px-2 py-1 text-right text-sm text-white outline-none ring-cyanGlow/40 focus:ring-2"
                            />
                          </div>
                          <p className="text-xs text-slate-400">
                            {(product.unitPricePaise / 100).toLocaleString("en-IN", {
                              style: "currency",
                              currency: "INR",
                              maximumFractionDigits: 2
                            })}{" "}
                            per {product.unit} · line{" "}
                            {(lineTotalPaise / 100).toLocaleString("en-IN", {
                              style: "currency",
                              currency: "INR",
                              maximumFractionDigits: 2
                            })}
                          </p>
                        </div>

                        <button
                          disabled={soldOut || isBusy}
                          onClick={() => reserve(product, stock)}
                          className="ripple-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-cyanGlow to-violetGlow px-4 py-3 text-sm font-semibold text-void shadow-neon transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : soldOut ? (
                            <AlertTriangle className="h-4 w-4" />
                          ) : (
                            <PackageCheck className="h-4 w-4" />
                          )}
                          {soldOut ? "Sold out" : `Reserve ${selectedQty} ${product.unit}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
