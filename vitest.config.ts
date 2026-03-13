import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "jsr:@supabase/supabase-js@2.49.8": path.resolve(__dirname, "tests/mocks/supabase-js.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/setup-vitest.ts"],
    restoreMocks: true,
  },
});
