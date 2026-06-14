// Test-only config: vitest uses this INSTEAD of vite.config.ts,
// so tests run without the dev server's PORT/BASE_PATH requirements.
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
