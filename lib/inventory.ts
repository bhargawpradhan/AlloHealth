import { ClientSession, Db } from "mongodb";
import { COLLECTIONS, getDb, getMongoClient } from "@/lib/mongodb";

const RESERVATION_MINUTES = 10;

export class InsufficientStockError extends Error {}
export class ExpiredReservationError extends Error {}
export class ReservationStateError extends Error {}
export class PaymentOrderMissingError extends Error {}
export class PaymentOrderMismatchError extends Error {}
export class PaymentAlreadyUsedError extends Error {}

type ReservationRow = {
  _id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  customer?: {
    name: string;
    email: string;
    phone: string;
  };
  status: "pending" | "confirmed" | "released";
  releaseReason?: "cancelled" | "expired" | null;
  expiresAt: Date;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProductRow = {
  _id: string;
  name: string;
  imageUrl: string;
  unit?: string;
  unitPricePaise?: number;
};

type WarehouseRow = {
  _id: string;
  name: string;
  location: string;
};

type InventoryRow = {
  _id: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
  updatedAt: Date;
};

export async function loadReservationPayload(db: Db, id: string, session?: ClientSession) {
  const reservations = db.collection<ReservationRow>(COLLECTIONS.reservations);
  const reservation = await reservations.findOne({ _id: id }, { session });
  if (!reservation) {
    return null;
  }

  const products = db.collection<ProductRow>(COLLECTIONS.products);
  const warehouses = db.collection<WarehouseRow>(COLLECTIONS.warehouses);

  const [product, warehouse] = await Promise.all([
    products.findOne({ _id: reservation.productId }, { session }),
    warehouses.findOne({ _id: reservation.warehouseId }, { session })
  ]);

  if (!product || !warehouse) {
    throw new ReservationStateError("Related product or warehouse missing");
  }

  return {
    id: reservation._id,
    productId: reservation.productId,
    warehouseId: reservation.warehouseId,
    quantity: reservation.quantity,
    customer: reservation.customer ?? null,
    status: reservation.status,
    releaseReason:
      reservation.releaseReason ??
      (reservation.status === "released"
        ? reservation.updatedAt >= reservation.expiresAt
          ? "expired"
          : "cancelled"
        : null),
    expiresAt: reservation.expiresAt,
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
    razorpayOrderId: reservation.razorpayOrderId ?? null,
    razorpayPaymentId: reservation.razorpayPaymentId ?? null,
    product: {
      name: product.name,
      imageUrl: product.imageUrl,
      unit: product.unit ?? "pcs",
      unitPricePaise: product.unitPricePaise ?? 0
    },
    warehouse: {
      name: warehouse.name,
      location: warehouse.location
    }
  };
}

export async function releaseExpiredReservations(limit = 100) {
  const client = await getMongoClient();
  const db = await getDb();
  const session = client.startSession();
  let released = 0;

  try {
    for (let i = 0; i < limit; i += 1) {
      const did = await session.withTransaction(async () => {
        const reservations = db.collection<ReservationRow>(COLLECTIONS.reservations);
        const inventories = db.collection<InventoryRow>(COLLECTIONS.inventories);

        const doc = await reservations.findOneAndUpdate(
          {
            status: "pending",
            expiresAt: { $lte: new Date() }
          },
          { $set: { status: "released", releaseReason: "expired", updatedAt: new Date() } },
          { session, sort: { expiresAt: 1 }, returnDocument: "after" }
        );

        if (!doc) {
          return false;
        }

        const inv = await inventories.updateOne(
          { productId: doc.productId, warehouseId: doc.warehouseId },
          { $inc: { reservedStock: -doc.quantity }, $set: { updatedAt: new Date() } },
          { session }
        );

        if (inv.matchedCount === 0) {
          throw new Error("Inventory row missing during expiry release");
        }

        return true;
      });

      if (!did) {
        break;
      }
      released += 1;
    }
  } finally {
    await session.endSession();
  }

  return released;
}

export async function reserveInventory(input: {
  productId: string;
  warehouseId: string;
  quantity: number;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
}) {
  const { productId, warehouseId, quantity, customer } = input;
  const client = await getMongoClient();
  const db = await getDb();
  const session = client.startSession();
  const reservationId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

  try {
    await session.withTransaction(async () => {
      const inventories = db.collection<InventoryRow>(COLLECTIONS.inventories);
      const reservations = db.collection<ReservationRow>(COLLECTIONS.reservations);

      const invResult = await inventories.findOneAndUpdate(
        {
          productId,
          warehouseId,
          $expr: {
            $gte: [{ $subtract: ["$totalStock", "$reservedStock"] }, quantity]
          }
        },
        {
          $inc: { reservedStock: quantity },
          $set: { updatedAt: new Date() }
        },
        { session, returnDocument: "after" }
      );

      if (!invResult) {
        const exists = await inventories.findOne({ productId, warehouseId }, { session });
        if (!exists) {
          throw new InsufficientStockError("Inventory row not found");
        }
        throw new InsufficientStockError("Not enough stock available");
      }

      await reservations.insertOne(
        {
          _id: reservationId,
          productId,
          warehouseId,
          quantity,
          customer,
          status: "pending",
          expiresAt,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { session }
      );
    });

    const payload = await loadReservationPayload(db, reservationId);
    if (!payload) {
      throw new Error("Reservation missing after create");
    }
    return payload;
  } finally {
    await session.endSession();
  }
}

export async function confirmReservation(
  id: string,
  payment: { orderId: string; paymentId: string }
) {
  const client = await getMongoClient();
  const db = await getDb();
  const session = client.startSession();

  try {
    let payload: NonNullable<Awaited<ReturnType<typeof loadReservationPayload>>> | null = null;

    await session.withTransaction(async () => {
      const reservations = db.collection<ReservationRow>(COLLECTIONS.reservations);
      const inventories = db.collection<InventoryRow>(COLLECTIONS.inventories);

      const reservation = await reservations.findOne({ _id: id }, { session });

      if (!reservation) {
        throw new ReservationStateError("Reservation not found");
      }

      if (reservation.status !== "pending") {
        throw new ReservationStateError("Reservation is not pending");
      }

      if (!reservation.razorpayOrderId) {
        throw new PaymentOrderMissingError("Create a Razorpay order before confirming payment");
      }

      if (reservation.razorpayOrderId !== payment.orderId) {
        throw new PaymentOrderMismatchError("Payment does not match the active checkout order");
      }

      const duplicate = await reservations.findOne(
        {
          razorpayPaymentId: payment.paymentId,
          _id: { $ne: id }
        },
        { session }
      );

      if (duplicate) {
        throw new PaymentAlreadyUsedError(
          "This payment has already been applied to another reservation"
        );
      }

      if (reservation.expiresAt <= new Date()) {
        await reservations.updateOne(
          { _id: id },
          { $set: { status: "released", releaseReason: "expired", updatedAt: new Date() } },
          { session }
        );
        await inventories.updateOne(
          { productId: reservation.productId, warehouseId: reservation.warehouseId },
          { $inc: { reservedStock: -reservation.quantity }, $set: { updatedAt: new Date() } },
          { session }
        );
        throw new ExpiredReservationError("Reservation expired");
      }

      const inv = await inventories.updateOne(
        { productId: reservation.productId, warehouseId: reservation.warehouseId },
        {
          $inc: {
            totalStock: -reservation.quantity,
            reservedStock: -reservation.quantity
          },
          $set: { updatedAt: new Date() }
        },
        { session }
      );

      if (inv.matchedCount === 0) {
        throw new ReservationStateError("Inventory row not found");
      }

      await reservations.updateOne(
        { _id: id },
        {
          $set: {
            status: "confirmed",
            razorpayPaymentId: payment.paymentId,
            updatedAt: new Date()
          }
        },
        { session }
      );

      const loaded = await loadReservationPayload(db, id, session);
      if (!loaded) {
        throw new ReservationStateError("Reservation missing after confirm");
      }
      payload = loaded;
    });

    if (!payload) {
      throw new ReservationStateError("Reservation missing after confirm");
    }

    return payload;
  } finally {
    await session.endSession();
  }
}

export async function releaseReservation(id: string) {
  const client = await getMongoClient();
  const db = await getDb();
  const session = client.startSession();

  try {
    let payload: NonNullable<Awaited<ReturnType<typeof loadReservationPayload>>> | null = null;

    await session.withTransaction(async () => {
      const reservations = db.collection<ReservationRow>(COLLECTIONS.reservations);
      const inventories = db.collection<InventoryRow>(COLLECTIONS.inventories);

      const reservation = await reservations.findOne({ _id: id }, { session });

      if (!reservation) {
        throw new ReservationStateError("Reservation not found");
      }

      if (reservation.status !== "pending") {
        const loaded = await loadReservationPayload(db, id, session);
        if (!loaded) {
          throw new ReservationStateError("Reservation not found");
        }
        payload = loaded;
        return;
      }

      const inv = await inventories.updateOne(
        { productId: reservation.productId, warehouseId: reservation.warehouseId },
        { $inc: { reservedStock: -reservation.quantity }, $set: { updatedAt: new Date() } },
        { session }
      );

      if (inv.matchedCount === 0) {
        throw new ReservationStateError("Inventory row not found");
      }

      await reservations.updateOne(
        { _id: id },
        { $set: { status: "released", releaseReason: "cancelled", updatedAt: new Date() } },
        { session }
      );

      const loaded = await loadReservationPayload(db, id, session);
      if (!loaded) {
        throw new ReservationStateError("Reservation not found");
      }
      payload = loaded;
    });

    if (!payload) {
      throw new ReservationStateError("Reservation missing after release");
    }

    return payload;
  } finally {
    await session.endSession();
  }
}
