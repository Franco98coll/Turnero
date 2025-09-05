import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3002",
    },
  },
  build: {
    outDir: "dist",
  },
  define: {
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE || ""),
  },
});
