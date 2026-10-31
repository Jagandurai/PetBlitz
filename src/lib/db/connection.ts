import mongoose, { ClientSession } from "mongoose";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

interface Cache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  txSupported?: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __petblitzMongoose: Cache | undefined;
}

// Cached on globalThis so Next.js dev hot-reload and concurrent requests share ONE connection.
const cache: Cache = (globalThis.__petblitzMongoose ??= { conn: null, promise: null });

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  if (!cache.promise) {
    const env = getEnv();
    cache.promise = mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 8_000,
      connectTimeoutMS: 8_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 10,
      bufferCommands: false, // fail fast instead of silently queueing
      autoIndex: false, // indexes are created explicitly via `npm run db:indexes`
    });
  }
  try {
    cache.conn = await cache.promise;
    return cache.conn;
  } catch {
    cache.promise = null;
    cache.conn = null;
    // Never leak the raw driver error (may contain hostnames).
    throw new AppError("DB_UNAVAILABLE", 503, "Database is currently unavailable");
  }
}

export async function disconnectDB() {
  if (cache.conn) await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
  cache.txSupported = undefined;
}

export async function pingDB(): Promise<{ ok: true; database: string; latencyMs: number }> {
  const m = await connectDB();
  const t0 = Date.now();
  await m.connection.db!.admin().ping();
  return { ok: true, database: m.connection.name, latencyMs: Date.now() - t0 };
}

/** Transactions need a replica set / sharded cluster (Atlas always qualifies; a standalone mongod does not). */
export async function supportsTransactions(): Promise<boolean> {
  if (cache.txSupported !== undefined) return cache.txSupported;
  const m = await connectDB();
  const hello = (await m.connection.db!.admin().command({ hello: 1 })) as { setName?: string; msg?: string };
  cache.txSupported = Boolean(hello.setName) || hello.msg === "isdbgrid";
  return cache.txSupported;
}

/**
 * Runs `fn` in a transaction when supported. Otherwise runs it WITHOUT a session
 * (callers must be written so a partial failure is recoverable - see docs/DATABASE.md).
 */
export async function withTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  const m = await connectDB();
  if (!(await supportsTransactions())) return fn(undefined);
  const session = await m.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
