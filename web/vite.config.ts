import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue2";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        "/api": "http://127.0.0.1:3001",
      },
    },
    build: {
      outDir: "dist",
    },
    define: {
      __API_BASE__: JSON.stringify(env.VITE_API_BASE || ""),
    },
  };
});
