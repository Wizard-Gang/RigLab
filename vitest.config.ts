import { defineConfig } from "vitest/config";
import { riglabLibrary } from "./scripts/library-plugin.mjs";

// Rig, contract and solver code is DOM-free, so the whole suite runs in the node environment. Tests always read the
// placeholder library, so they behave the same on every machine.
export default defineConfig({
  plugins: [riglabLibrary({ root: import.meta.dirname, placeholder: true })],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
