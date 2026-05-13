# Aegis Inventory Reservation System

A production-grade inventory reservation demo for high-concurrency commerce checkouts.

Built with:

- Next.js App Router for UI and API routes
- Node.js runtime
- **MongoDB** (official `mongodb` driver) with **multi-document transactions**
- MongoDB-backed idempotency result caching
- Tailwind CSS, Framer Motion, Sonner, and Lucide React

## What It Does

- Reserves inventory for 10 minutes during checkout.
- Makes reserved stock unavailable to other shoppers.
- Confirms reservations after successful payment.
- Releases reservations on payment failure, cancellation, or timeout.
- Prevents overselling using **atomic conditional updates** and **transactions** on the same inventory document.
- Returns HTTP `409` when stock is no longer available.
- Returns HTTP `410` when a pending reservation is expired.

## Setup

Create `.env.local` from `.env.example` and provide your own values.

**MongoDB:** Use a deployment that supports **multi-document transactions** — typically a **replica set** (MongoDB Atlas M0+ includes this). Plain single-node `mongod` without a replica set will throw transaction errors.

```bash
MONGODB_URI="mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority"
MONGODB_DB_NAME="inventory"
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
```

Use [Razorpay test keys](https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/#generate-api-keys) for local development. The checkout modal loads `https://checkout.razorpay.com/v1/checkout.js` and uses Standard Checkout with server-created orders.

Install dependencies:

```bash
npm install
```

Seed demo inventory (creates collections, indexes, and sample data):

```bash
npm run db:seed
```

Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## API

### `GET /api/products`

Returns all products with warehouse stock.

Each product includes:

- `unit` — display unit for quantity (for example `pcs`, `pair`)
- `unitPricePaise` — price per single unit in INR paise (used for Razorpay totals)

Each warehouse includes:

- `totalStock`
- `reservedStock`
- `availableStock = totalStock - reservedStock`

### `GET /api/warehouses`

Returns all warehouses.

### `POST /api/reservations`

Body:

```json
{
  "productId": "prod-quantum-headset",
  "warehouseId": "wh-delhi",
  "quantity": 1
}
```

Optional header:

```http
Idempotency-Key: unique-client-generated-key
```

Responses:

- `201` reservation created
- `400` invalid input
- `409` insufficient stock

### `POST /api/reservations/:id/razorpay-order`

Creates a Razorpay order for `quantity × unitPricePaise`, stores `razorpayOrderId` on the reservation (must match on confirm), and returns checkout metadata.

Responses:

- `200` `{ orderId, amount, currency, keyId, reservationId, quantity, unit, unitPricePaise }`
- `400` invalid state or order creation failure
- `410` reservation expired
- `503` Razorpay keys missing

### `POST /api/reservations/:id/confirm`

Verifies a Razorpay payment signature, then confirms the reservation inside a **MongoDB transaction** (capture `totalStock` / `reservedStock`).

Body (Standard Checkout success payload):

```json
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature"
}
```

Responses:

- `200` reservation confirmed
- `400` invalid signature, missing fields, or reservation state
- `409` payment id already applied elsewhere
- `410` reservation expired
- `503` Razorpay keys missing

### `POST /api/reservations/:id/release`

Releases a pending reservation and returns reserved stock to availability.

Responses:

- `200` reservation released
- `400` invalid reservation

### `GET /api/cron/release-expired`

Releases expired pending reservations. `vercel.json` schedules this every minute.

## Concurrency Approach

The reservation path uses **MongoDB multi-document transactions** plus an **atomic conditional update** on the inventory row:

1. `findOneAndUpdate` on `inventories` with filter  
   `totalStock - reservedStock >= quantity` (via `$expr`).
2. If no document is updated → `409` (no row or insufficient available stock).
3. Otherwise `$inc` `reservedStock` by `quantity` and insert a `pending` reservation in the **same transaction**.

Two concurrent requests for the last unit: only one `findOneAndUpdate` can succeed because the first increments `reservedStock`, so the second no longer satisfies the `$expr` guard.

MongoDB is the source of truth for products, warehouses, inventory, reservations, payment references, releases, and idempotency records.

## Confirmation, Razorpay, and Release

Payment flow:

1. Client calls `POST /api/reservations/:id/razorpay-order` to create a Razorpay order; the API persists `razorpayOrderId` on the reservation.
2. Client opens Razorpay Standard Checkout with `order_id`, `amount`, and `key` from the response.
3. After the shopper authorizes payment, Razorpay returns `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.
4. Client posts those fields to `POST /api/reservations/:id/confirm`.
5. The API verifies `HMAC_SHA256(order_id + "|" + payment_id, key_secret)` using a constant-time compare, ensures the order id matches the stored `razorpayOrderId`, rejects duplicate `razorpayPaymentId` values, then runs inventory updates inside a **transaction**.

For production hardening, add Razorpay webhooks to reconcile payments that succeed on Razorpay but fail to reach your API during network blips.

## Expiry Mechanism

- Cron cleanup: `GET /api/cron/release-expired` is configured in `vercel.json` to run every minute on Vercel.
- Lazy cleanup: product reads and reservation writes call `releaseExpiredReservations()` before continuing.

Expired rows are claimed with `findOneAndUpdate` (sorted by `expiresAt`) inside short transactions so concurrent cron workers are unlikely to process the same reservation twice.

## Idempotency

`POST /api/reservations`, `confirm`, and `release` accept an `Idempotency-Key` header.

The API stores the response payload in MongoDB for 10 minutes. Reusing the same key returns the cached response and avoids re-running the database transaction.

Inventory correctness and retry protection both come from MongoDB atomic updates, transactions, and TTL-indexed idempotency documents.

## Deployment

Recommended production stack:

- Vercel for Next.js frontend and API routes
- **MongoDB Atlas** (or any replica set) for the database

Vercel steps:

1. Add `MONGODB_URI`, `MONGODB_DB_NAME`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET` in project environment variables.
2. Run `npm run db:seed` once (or from a secure CI job) against the target cluster.
3. Keep the included `vercel.json` cron schedule enabled.

## Trade-Offs

- Hot SKUs still serialize on the same inventory document under heavy contention (similar to row-level locking in SQL).
- Multi-document transactions require a replica set; not ideal for legacy single-node `mongod` without replica set configuration.
- MongoDB idempotency records expire through a TTL index, so cleanup is eventually consistent rather than instantaneous to the second.

## Future Improvements

- Shard inventory by product, warehouse, and region for high-volume catalogs.
- Add event-driven reservation lifecycle events for fulfillment and payments.
- Move payment confirmation into a durable webhook consumer.
- Add inventory audit ledgers for financial-grade reconciliation.
- Add load tests that fire concurrent reservation requests against the same final unit.
