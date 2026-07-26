import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(root, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ["ajv", "ajv/dist/2020.js"],
    },
  },
});
