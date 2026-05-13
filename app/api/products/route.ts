import { MongoServerError } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { badRequest, json } from "@/lib/http";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { releaseExpiredReservations } from "@/lib/inventory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanImageUrl(value: unknown) {
  const imageUrl = cleanText(value);
  if (!imageUrl) {
    return FALLBACK_IMAGE;
  }

  try {
    const parsed = new URL(imageUrl);
    return parsed.protocol === "https:" ? imageUrl : FALLBACK_IMAGE;
  } catch {
    return FALLBACK_IMAGE;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function mongoErrorMessage(error: unknown): string {
  if (error instanceof MongoServerError) {
    return `${error.message} (code ${error.code})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown database error";
}

export async function GET() {
  try {
    await releaseExpiredReservations().catch((err) => {
      console.error("[api/products] releaseExpiredReservations", err);
    });

    const db = await getDb();
    const productsCol = db.collection(COLLECTIONS.products);
    const inventoriesCol = db.collection(COLLECTIONS.inventories);
    const warehousesCol = db.collection(COLLECTIONS.warehouses);

    const products = await productsCol.find({}).sort({ name: 1 }).toArray();

    const payload = await Promise.all(
      products.map(async (product) => {
        const invRows = await inventoriesCol
          .find({ productId: product._id })
          .sort({ warehouseId: 1 })
          .toArray();

        const warehouses = await Promise.all(
          invRows.map(async (item) => {
            const wh = await warehousesCol.findOne({ _id: item.warehouseId });
            if (!wh) {
              return null;
            }
            const totalStock = item.totalStock as number;
            const reservedStock = (item.reservedStock as number) ?? 0;
            return {
              inventoryId: String(item._id),
              warehouseId: String(item.warehouseId),
              warehouseName: wh.name as string,
              location: wh.location as string,
              totalStock,
              reservedStock,
              availableStock: totalStock - reservedStock
            };
          })
        );

        return {
          id: String(product._id),
          name: product.name as string,
          imageUrl: product.imageUrl as string,
          unit: (product.unit as string) ?? "pcs",
          unitPricePaise: (product.unitPricePaise as number) ?? 0,
          warehouses: warehouses.filter(Boolean)
        };
      })
    );

    return NextResponse.json({ products: payload });
  } catch (error) {
    console.error("[api/products] GET failed", error);
    const message = mongoErrorMessage(error);
    return NextResponse.json(
      {
        error: message,
        hint:
          message.includes("replica set") || message.includes("transaction")
            ? "Multi-document transactions require a replica set (e.g. MongoDB Atlas). Set MONGODB_URI to an Atlas cluster or a local replica set."
            : message.includes("ENOTFOUND") || message.includes("querySrv")
              ? "Check MONGODB_URI and network/DNS. For Atlas, allow your IP in Network Access."
              : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = cleanText(body?.name);
  const imageUrl = cleanImageUrl(body?.imageUrl);
  const unit = cleanText(body?.unit) || "pcs";
  const warehouseId = cleanText(body?.warehouseId);
  const quantity = Number(body?.quantity);
  const unitPricePaise = Math.round(Number(body?.unitPriceRupees) * 100);

  if (!name || !warehouseId) {
    return badRequest("Product name and warehouse are required");
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return badRequest("Quantity must be a positive integer");
  }

  if (!Number.isInteger(unitPricePaise) || unitPricePaise < 100) {
    return badRequest("Unit price must be at least ₹1");
  }

  const db = await getDb();
  const warehouses = db.collection<{ _id: string }>(COLLECTIONS.warehouses);
  const products = db.collection<{
    _id: string;
    name: string;
    imageUrl: string;
    unit: string;
    unitPricePaise: number;
    createdAt: Date;
    updatedAt: Date;
  }>(COLLECTIONS.products);
  const inventories = db.collection<{
    _id: string;
    productId: string;
    warehouseId: string;
    totalStock: number;
    reservedStock: number;
    createdAt: Date;
    updatedAt: Date;
  }>(COLLECTIONS.inventories);

  const warehouse = await warehouses.findOne({ _id: warehouseId });
  if (!warehouse) {
    return badRequest("Warehouse not found");
  }

  const now = new Date();
  let product = await products.findOne({ name });
  if (!product) {
    const baseId = slugify(name) || "product";
    const productId = `prod-${baseId}-${crypto.randomUUID().slice(0, 8)}`;
    product = {
      _id: productId,
      name,
      imageUrl,
      unit,
      unitPricePaise,
      createdAt: now,
      updatedAt: now
    };
    await products.insertOne(product);
  } else {
    await products.updateOne(
      { _id: product._id },
      { $set: { imageUrl, unit, unitPricePaise, updatedAt: now } }
    );
  }

  const inventoryId = `inv-${product._id.replace(/^prod-/, "")}-${warehouseId.replace(/^wh-/, "")}`;
  await inventories.updateOne(
    { productId: product._id, warehouseId },
    {
      $setOnInsert: {
        _id: inventoryId,
        productId: product._id,
        warehouseId,
        reservedStock: 0,
        createdAt: now
      },
      $inc: { totalStock: quantity },
      $set: { updatedAt: now }
    },
    { upsert: true }
  );

  return json({
    status: 201,
    body: {
      product: {
        id: product._id,
        name,
        imageUrl,
        unit,
        unitPricePaise
      },
      addedQuantity: quantity,
      warehouseId
    }
  });
}
