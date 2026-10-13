import { defineConfig } from "vite";
import { riglabLibrary } from "./scripts/library-plugin.mjs";

// `--mode placeholder` builds against the repository's placeholder library, as `npm run check` does.
export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [riglabLibrary({ root: import.meta.dirname, placeholder: mode === "placeholder" })],
  publicDir: false,
  server: {
    port: 5180,
    strictPort: true,
  },
}));
