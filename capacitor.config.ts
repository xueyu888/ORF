/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from "@capacitor/cli";

const DEFAULT_ORF_CLIENT_URL = "https://orf-xueyu.duckdns.org:8443/";

function resolveClientUrl() {
  const rawUrl = process.env.ORF_CLIENT_URL || process.env.ORF_APP_URL || DEFAULT_ORF_CLIENT_URL;
  const clientUrl = new URL(rawUrl);
  if (clientUrl.protocol !== "https:" && clientUrl.hostname !== "localhost" && clientUrl.hostname !== "127.0.0.1") {
    throw new Error("ORF Android client requires HTTPS unless it targets localhost.");
  }
  return clientUrl.toString();
}

const config: CapacitorConfig = {
  appId: "org.duckdns.orfxueyu.orf",
  appName: "ORF",
  webDir: "dist",
  server: {
    url: resolveClientUrl(),
    cleartext: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_orf_notification",
      iconColor: "#0F9EB5",
    },
  },
};

export default config;
