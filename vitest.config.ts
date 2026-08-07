import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Kept separate from `vite.config.ts` on purpose: the library config runs
 * `vite-plugin-dts` and a `lib` build, neither of which has anything to do
 * with running tests.
 *
 * The default environment is `jsdom` because most of the suite renders
 * components. Files that must prove the package works without a DOM opt out
 * per file with a `// @vitest-environment node` docblock.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/main.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
