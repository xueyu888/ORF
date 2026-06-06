import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const apiProxyTarget = process.env.ORF_API_PROXY_TARGET ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    proxy: {
      "/api": apiProxyTarget,
      "/health": apiProxyTarget,
      "/settings/backgrounds": apiProxyTarget,
    },
  },
});
