import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  publicDir: false,
  server: {
    port: 5180,
    strictPort: true,
  },
});
