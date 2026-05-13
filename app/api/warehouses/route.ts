import { NextRequest, NextResponse } from "next/server";
import { badRequest, json } from "@/lib/http";
import { COLLECTIONS, getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET() {
  const db = await getDb();
  const warehouses = await db
    .collection(COLLECTIONS.warehouses)
    .find({})
    .sort({ name: 1 })
    .toArray();

  return NextResponse.json({
    warehouses: warehouses.map((w) => ({
      id: String(w._id),
      name: w.name,
      location: w.location
    }))
  });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = cleanText(body?.name);
  const location = cleanText(body?.location);

  if (!name || !location) {
    return badRequest("Warehouse name and location are required");
  }

  const db = await getDb();
  const warehouses = db.collection<{
    _id: string;
    name: string;
    location: string;
    createdAt: Date;
    updatedAt: Date;
  }>(COLLECTIONS.warehouses);

  const existing = await warehouses.findOne({ name });
  if (existing) {
    return json({
      status: 200,
      body: {
        warehouse: {
          id: existing._id,
          name: existing.name,
          location: existing.location
        }
      }
    });
  }

  const now = new Date();
  const warehouse = {
    _id: `wh-${slugify(name) || "warehouse"}-${crypto.randomUUID().slice(0, 8)}`,
    name,
    location,
    createdAt: now,
    updatedAt: now
  };

  await warehouses.insertOne(warehouse);

  return json({
    status: 201,
    body: {
      warehouse: {
        id: warehouse._id,
        name: warehouse.name,
        location: warehouse.location
      }
    }
  });
}
