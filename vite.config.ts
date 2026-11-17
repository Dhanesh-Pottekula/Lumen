import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { filmServer } from "./server/plugin";

export default defineConfig({
  plugins: [react(), filmServer()],
  // Films are written to runs/ while the page is open; they are served by the film server, not watched.
  server: { watch: { ignored: ["**/runs/**"] } },
});
