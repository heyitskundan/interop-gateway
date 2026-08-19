import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // main.tsx only bootstraps ReactDOM.createRoot — no logic worth unit testing.
      exclude: ["src/main.tsx"],
      thresholds: {
        lines: 90,
      },
    },
  },
});
