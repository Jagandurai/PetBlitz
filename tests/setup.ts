
import { randomBytes } from "node:crypto";

process.env.ADMIN_API_KEY ??= "test-admin-key-test-admin-key-test-admin-key";
process.env.RAZORPAY_WEBHOOK_SECRET ??= "whsec_rzp_test";
process.env.CATEGORY_MAX_DEPTH = "3";

export const HAS_DB = Boolean(process.env.MONGODB_TEST_URI);

if (HAS_DB) {
  // Database tests must use the dedicated test database, never production.
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
  process.env.MONGODB_DB_NAME = "PetBlitzTest";
} else {
  // Unit tests can run without a real database.
  process.env.MONGODB_URI ??= "mongodb://invalid.invalid/none";
}
