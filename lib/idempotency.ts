import type { NextRequest } from "next/server";
import type { ApiResult } from "@/lib/http";
import { COLLECTIONS, getDb } from "@/lib/mongodb";

const TTL_SECONDS = 60 * 10;

type CachedResult = ApiResult<unknown>;
type IdempotencyRow = {
  _id: string;
  scope: string;
  key: string;
  result: CachedResult;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const globalForIdempotency = globalThis as unknown as {
  idempotencyIndexes?: Promise<void>;
};

export async function readIdempotencyResult(request: NextRequest, scope: string) {
  const key = request.headers.get("idempotency-key");
  if (!key) {
    return null;
  }

  const db = await getDb();
  await ensureIdempotencyIndexes();
  const collection = db.collection<IdempotencyRow>(COLLECTIONS.idempotencyResults);
  const row = await collection.findOne({ _id: cacheKey(scope, key) });
  if (!row) {
    return null;
  }

  if (row.expiresAt <= new Date()) {
    await collection.deleteOne({ _id: row._id });
    return null;
  }

  return row.result;
}

export async function writeIdempotencyResult(
  request: NextRequest,
  scope: string,
  result: CachedResult
) {
  const key = request.headers.get("idempotency-key");
  if (!key) {
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000);
  const db = await getDb();
  await ensureIdempotencyIndexes();

  await db.collection<IdempotencyRow>(COLLECTIONS.idempotencyResults).updateOne(
    { _id: cacheKey(scope, key) },
    {
      $set: {
        scope,
        key,
        result,
        expiresAt,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );
}

function cacheKey(scope: string, key: string) {
  return `inventory-reservation:${scope}:${key}`;
}

async function ensureIdempotencyIndexes() {
  if (!globalForIdempotency.idempotencyIndexes) {
    globalForIdempotency.idempotencyIndexes = getDb().then(async (db) => {
      const collection = db.collection<IdempotencyRow>(COLLECTIONS.idempotencyResults);
      await Promise.all([
        collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        collection.createIndex({ scope: 1, key: 1 }, { unique: true })
      ]);
    });
  }

  return globalForIdempotency.idempotencyIndexes;
}
