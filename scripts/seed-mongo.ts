import { loadEnvConfig } from "@next/env";
import { MongoClient } from "mongodb";

loadEnvConfig(process.cwd());

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? "inventory";

if (!uri) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}
const mongoUri = uri;

const products = [
  {
    _id: "prod-quantum-headset",
    name: "Quantum Checkout Headset",
    imageUrl:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80",
    unit: "pcs",
    unitPricePaise: 49_900
  },
  {
    _id: "prod-nova-watch",
    name: "Nova Pulse Smartwatch",
    imageUrl:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
    unit: "pair",
    unitPricePaise: 32_990
  },
  {
    _id: "prod-orbit-camera",
    name: "Orbit 8K Action Camera",
    imageUrl:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
    unit: "pcs",
    unitPricePaise: 78_500
  }
];

const warehouses = [
  { _id: "wh-mumbai", name: "Mumbai Edge Node", location: "Mumbai, India" },
  { _id: "wh-bengaluru", name: "Bengaluru Fulfillment Grid", location: "Bengaluru, India" },
  { _id: "wh-delhi", name: "Delhi North Hub", location: "New Delhi, India" }
];

const now = () => new Date();

type ProductSeed = (typeof products)[number] & { createdAt: Date; updatedAt: Date };
type WarehouseSeed = (typeof warehouses)[number] & { createdAt: Date; updatedAt: Date };
type InventorySeed = {
  _id: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
  createdAt: Date;
  updatedAt: Date;
};

async function main() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  await db.collection("reservations").deleteMany({});
  await db.collection("inventories").deleteMany({});
  await db.collection("idempotencyResults").deleteMany({});
  await db.collection("products").deleteMany({});
  await db.collection("warehouses").deleteMany({});

  const t = now();
  await db.collection<ProductSeed>("products").insertMany(
    products.map((p) => ({
      ...p,
      createdAt: t,
      updatedAt: t
    }))
  );
  await db.collection<WarehouseSeed>("warehouses").insertMany(
    warehouses.map((w) => ({
      ...w,
      createdAt: t,
      updatedAt: t
    }))
  );

  const inventoryRows = [
    { _id: "inv-qh-mu", productId: "prod-quantum-headset", warehouseId: "wh-mumbai", totalStock: 12 },
    { _id: "inv-qh-bl", productId: "prod-quantum-headset", warehouseId: "wh-bengaluru", totalStock: 4 },
    { _id: "inv-qh-dl", productId: "prod-quantum-headset", warehouseId: "wh-delhi", totalStock: 1 },
    { _id: "inv-nw-mu", productId: "prod-nova-watch", warehouseId: "wh-mumbai", totalStock: 8 },
    { _id: "inv-nw-bl", productId: "prod-nova-watch", warehouseId: "wh-bengaluru", totalStock: 16 },
    { _id: "inv-nw-dl", productId: "prod-nova-watch", warehouseId: "wh-delhi", totalStock: 3 },
    { _id: "inv-oc-mu", productId: "prod-orbit-camera", warehouseId: "wh-mumbai", totalStock: 6 },
    { _id: "inv-oc-bl", productId: "prod-orbit-camera", warehouseId: "wh-bengaluru", totalStock: 2 },
    { _id: "inv-oc-dl", productId: "prod-orbit-camera", warehouseId: "wh-delhi", totalStock: 9 }
  ];

  await db.collection<InventorySeed>("inventories").insertMany(
    inventoryRows.map((row) => ({
      ...row,
      reservedStock: 0,
      createdAt: t,
      updatedAt: t
    }))
  );

  await db.collection("inventories").createIndex({ productId: 1, warehouseId: 1 }, { unique: true });
  await db.collection("reservations").createIndex({ status: 1, expiresAt: 1 });
  await db.collection("reservations").createIndex({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
  await db.collection("idempotencyResults").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("idempotencyResults").createIndex({ scope: 1, key: 1 }, { unique: true });

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
