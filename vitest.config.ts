
import { defineConfig } from "vitest/config";
import path from "node:path";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Load environment variables from .env for database tests.
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return {
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      setupFiles: ["tests/setup.ts"],
      testTimeout: 30_000,
      fileParallelism: false,
    },
  };
});
