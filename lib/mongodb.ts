import { Db, MongoClient } from "mongodb";

const globalForMongo = globalThis as unknown as {
  mongoClient?: MongoClient;
};

export async function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  if (!globalForMongo.mongoClient) {
    const client = new MongoClient(uri, { maxPoolSize: 20 });
    await client.connect();
    globalForMongo.mongoClient = client;
  }

  return globalForMongo.mongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const name = process.env.MONGODB_DB_NAME ?? "inventory";
  return client.db(name);
}

export const COLLECTIONS = {
  products: "products",
  warehouses: "warehouses",
  inventories: "inventories",
  reservations: "reservations",
  idempotencyResults: "idempotencyResults"
} as const;
