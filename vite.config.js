import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vast.ai server configuration
const VAST_AI_BACKEND = process.env.VITE_API_BASE_URL || "http://74.48.78.46:24707";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: VAST_AI_BACKEND,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/results": {
        target: VAST_AI_BACKEND,
        changeOrigin: true,
      },
    },
  },
});


