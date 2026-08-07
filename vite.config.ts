import fs from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

const packageJson = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
const feedbackModulePackageJson = JSON.parse(fs.readFileSync(new URL("./modules/feedback/package.json", import.meta.url), "utf8")) as {
  exports: Record<string, string>;
  name: string;
};

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

function isPrivateSettingsRequest(requestUrl: string | undefined) {
  if (!requestUrl) return false;
  try {
    const pathname = decodeURIComponent(new URL(requestUrl, "http://orf.local").pathname);
    return /^\/settings\/(?:users|system|user)(?:\/|$)/.test(pathname);
  } catch {
    return true;
  }
}

function privateSettingsStaticGuard() {
  const middleware = (request: { url?: string }, response: { statusCode: number; end: (body?: string) => void }, next: () => void) => {
    if (!isPrivateSettingsRequest(request.url)) {
      next();
      return;
    }
    response.statusCode = 404;
    response.end("Not Found");
  };

  return {
    name: "orf-private-settings-static-guard",
    configureServer(server: { middlewares: { use: (handler: typeof middleware) => void } }) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: { middlewares: { use: (handler: typeof middleware) => void } }) {
      server.middlewares.use(middleware);
    },
  };
}

function workspacePackageExportAliases(packageName: string, packageRootUrl: URL, exportsMap: Record<string, string>) {
  return Object.entries(exportsMap).map(([subpath, target]) => {
    const publicSubpath = subpath === "." ? "" : `/${subpath.replace(/^\.\//, "")}`;
    return {
      find: `${packageName}${publicSubpath}`,
      replacement: fileURLToPath(new URL(target, packageRootUrl)),
    };
  });
}

const workspacePackageAliases = [
  ...workspacePackageExportAliases(
    feedbackModulePackageJson.name,
    new URL("./modules/feedback/", import.meta.url),
    feedbackModulePackageJson.exports,
  ),
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const allowedHost = publicFrontendHost(env);
  return {
    publicDir: false,
    build: {
      emptyOutDir: true,
      manifest: ".vite/manifest.json",
      rollupOptions: {
        output: {
          manualChunks: manualChunkForOrfModule,
        },
      },
    },
    plugins: [privateSettingsStaticGuard(), tailwindcss()],
    define: {
      __ORF_CLIENT_VERSION__: JSON.stringify(packageJson.version),
    },
    resolve: {
      alias: workspacePackageAliases,
    },
    server: {
      allowedHosts: allowedHost ? [allowedHost] : [],
      proxy: {
        "/api": "http://127.0.0.1:8787",
        "/health": "http://127.0.0.1:8787",
        "/settings/backgrounds": "http://127.0.0.1:8787",
      },
      watch: {
        ignored: [
          "**/.artifacts/**",
          "**/.orf/**",
          "**/android/**",
          "**/dist/**",
          "**/ios/**",
          "**/public/settings/**",
        ],
      },
    },
  };
});
