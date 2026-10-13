import { join } from "node:path";
import { defineConfig } from "vite";
import { riglabLibrary } from "./scripts/library-plugin.mjs";

// `--mode placeholder` builds against the repository's placeholder library, as `npm run check` does.
export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Two pages: the editor at / and the wardrobe at /wardrobe/.
    rolldownOptions: {
      input: { editor: join(import.meta.dirname, "index.html"), wardrobe: join(import.meta.dirname, "wardrobe/index.html") },
    },
  },
  plugins: [riglabLibrary({ root: import.meta.dirname, placeholder: mode === "placeholder" })],
  publicDir: false,
  server: {
    port: 5180,
    strictPort: true,
  },
}));
