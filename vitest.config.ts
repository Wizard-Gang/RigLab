import { defineConfig } from "vitest/config";

// Rig, contract and solver code is DOM-free, so the whole suite runs in the node environment.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
