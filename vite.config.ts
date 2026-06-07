import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

function publicFrontendHost(env: Record<string, string>) {
  const candidate = env.ORF_APP_URL || env.ORF_DUCKDNS_DOMAIN || env.ORF_WEB_DOMAIN || "";
  if (!candidate) return null;
  try {
    return new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`).hostname;
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const allowedHost = publicFrontendHost(env);
  return {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: allowedHost ? [allowedHost] : [],
      proxy: {
        "/api": "http://127.0.0.1:8787",
        "/health": "http://127.0.0.1:8787",
        "/settings/backgrounds": "http://127.0.0.1:8787",
      },
    },
  };
});
