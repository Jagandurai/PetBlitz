
import { Types } from "mongoose";
import { loadEnv } from "vite";
import { connectDB, disconnectDB } from "@/lib/db/connection";
import { ALL_MODELS, createAllIndexes } from "@/lib/db/indexes";
import { createCategory } from "@/services/category.service";

// Read .env directly so HAS_DB works even before tests/setup.ts executes.
const testEnv = loadEnv("test", process.cwd(), "");
const testUri = process.env.MONGODB_TEST_URI ?? testEnv.MONGODB_TEST_URI;

export const HAS_DB = Boolean(testUri);
let setupDbPromise: Promise<void> | null = null;

export async function setupDb() {
  if (!setupDbPromise) {
    setupDbPromise = (async () => {
      const m = await connectDB();

      if (m.connection.name !== "PetBlitzTest") {
        throw new Error("Refusing to run: not the dedicated PetBlitzTest database");
      }

      await createAllIndexes();
    })();
  }
  await setupDbPromise;
}

export async function cleanDb() {
  const m = await connectDB();

  if (m.connection.name !== "PetBlitzTest") {
    throw new Error("Refusing to clean a non-test database");
  }

  await Promise.all(Object.values(ALL_MODELS).map((model) => model.deleteMany({})));
}

export async function teardownDb() {
  try {
    const m = await connectDB();

    if (m.connection.name !== "PetBlitzTest") {
      throw new Error("Refusing to clean a non-test database");
    }

    await Promise.all(Object.values(ALL_MODELS).map((model) => model.deleteMany({})));
  } finally {
    await disconnectDB();
  }
}

export async function makeCats() {
  const dogs = await createCategory({ name: "Dogs", type: "dog" });
  const lab = await createCategory({ name: "Labrador", parentId: dogs.id });
  const accessories = await createCategory({
    name: "Accessories",
    type: "accessory",
  });
  const toys = await createCategory({
    name: "Toys",
    parentId: accessories.id,
  });
  return { dogs, lab, accessories, toys };
}

export async function makeUniqueCats() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const dogs = await createCategory({ name: `Dogs ${suffix}`, type: "dog" });
  const lab = await createCategory({ name: `Labrador ${suffix}`, parentId: dogs.id });
  const accessories = await createCategory({ name: `Accessories ${suffix}`, type: "accessory" });
  const toys = await createCategory({ name: `Toys ${suffix}`, parentId: accessories.id });
  return { dogs, lab, accessories, toys };
}

export const media = [
  {
    kind: "image" as const,
    url: "https://cdn.example.com/a.jpg",
    isPrimary: true,
  },
];

export const oid = () => new Types.ObjectId();
