import fs from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

const packageJson = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

function normalizedModuleId(id: string) {
  return id.replace(/\\/g, "/");
}

function manualChunkForOrfModule(id: string) {
  const moduleId = normalizedModuleId(id);

  if (
    moduleId.includes("/node_modules/@tiptap/") ||
    moduleId.includes("/node_modules/prosemirror-") ||
    moduleId.includes("/node_modules/orderedmap/") ||
    moduleId.includes("/node_modules/rope-sequence/") ||
    moduleId.includes("/node_modules/w3c-keyname/")
  ) {
    return "vendor-tiptap";
  }

  if (
    moduleId.includes("/src/features/rich-text/OrfRichTextEditor.tsx") ||
    moduleId.includes("/src/features/rich-text/orfRichTextExtensions.ts")
  ) {
    return "orf-rich-text-editor";
  }

  if (
    moduleId.includes("/src/features/rich-text/OrfRichTextMarkdownViewer.tsx") ||
    moduleId.includes("/src/features/rich-text/orfRichTextMarkdown.ts")
  ) {
    return "orf-rich-text-markdown";
  }

  return undefined;
}

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
    build: {
      emptyOutDir: false,
      rollupOptions: {
        output: {
          manualChunks: manualChunkForOrfModule,
        },
      },
    },
    plugins: [tailwindcss()],
    define: {
      __ORF_CLIENT_VERSION__: JSON.stringify(packageJson.version),
    },
    server: {
      allowedHosts: allowedHost ? [allowedHost] : [],
      proxy: {
        "/api": "http://127.0.0.1:8787",
        "/health": "http://127.0.0.1:8787",
        "/settings/backgrounds": "http://127.0.0.1:8787",
      },
      watch: {
        ignored: ["**/.artifacts/**", "**/.orf/**", "**/dist/**"],
      },
    },
  };
});
