#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const androidPackageName = "org.duckdns.orfxueyu.orf";
const googleServicesPath = path.resolve("android/app/google-services.json");
const rootGoogleServicesPath = path.resolve("google-services.json");
const capacitorSettingsPath = path.resolve("android/capacitor.settings.gradle");
const capacitorBuildPath = path.resolve("android/app/capacitor.build.gradle");
const capacitorPluginsPath = path.resolve("android/app/src/main/assets/capacitor.plugins.json");
const pushPluginPackage = "@capacitor/push-notifications";
const pushPluginClasspath = "com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin";

restoreGoogleServicesFromEnv();

const googleServices = readGoogleServices();
const fcmEnabled = googleServices.found && googleServices.packageNames.includes(androidPackageName);

if (fcmEnabled && !isPushPluginInstalled()) {
  console.error(`${pushPluginPackage} is required when android/app/google-services.json is present.`);
  process.exit(1);
}

if (!fcmEnabled) {
  removeGeneratedPushPlugin();
}

const detail = googleServices.found
  ? `packages=${googleServices.packageNames.join(",") || "none"}`
  : "google-services.json missing";
console.log(`Android FCM push: ${fcmEnabled ? "enabled" : "disabled"} (${detail}).`);

function restoreGoogleServicesFromEnv() {
  const encoded = process.env.ORF_ANDROID_GOOGLE_SERVICES_JSON_BASE64?.trim();
  if (!encoded) {
    restoreGoogleServicesFromRootFile();
    return;
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const parsed = JSON.parse(decoded);
  validateGoogleServicesPackageNames(parsed);
  fs.mkdirSync(path.dirname(googleServicesPath), { recursive: true });
  fs.writeFileSync(googleServicesPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function restoreGoogleServicesFromRootFile() {
  if (fs.existsSync(googleServicesPath) || !fs.existsSync(rootGoogleServicesPath)) return;
  const parsed = JSON.parse(fs.readFileSync(rootGoogleServicesPath, "utf8"));
  validateGoogleServicesPackageNames(parsed);
  fs.mkdirSync(path.dirname(googleServicesPath), { recursive: true });
  fs.writeFileSync(googleServicesPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function readGoogleServices() {
  if (!fs.existsSync(googleServicesPath)) return { found: false, packageNames: [] };
  const parsed = JSON.parse(fs.readFileSync(googleServicesPath, "utf8"));
  return { found: true, packageNames: validateGoogleServicesPackageNames(parsed) };
}

function validateGoogleServicesPackageNames(parsed) {
  const packageNames = Array.from(
    new Set(
      (parsed.client ?? [])
        .map((client) => client.client_info?.android_client_info?.package_name?.trim())
        .filter(Boolean),
    ),
  );
  if (packageNames.length === 0) {
    throw new Error("google-services.json does not contain an Android package_name.");
  }
  return packageNames;
}

function isPushPluginInstalled() {
  return fs.existsSync(path.resolve("node_modules/@capacitor/push-notifications/package.json"));
}

function removeGeneratedPushPlugin() {
  replaceFile(capacitorSettingsPath, (content) =>
    content
      .replace(
        /\ninclude ':capacitor-push-notifications'\nproject\(':capacitor-push-notifications'\)\.projectDir = new File\('\.\.\/node_modules\/@capacitor\/push-notifications\/android'\)\n/g,
        "\n",
      )
      .replace(/\n{2,}$/g, "\n"),
  );
  replaceFile(capacitorBuildPath, (content) =>
    content.replace(/\n\s*implementation project\(':capacitor-push-notifications'\)\n/g, "\n"),
  );
  replaceJsonFile(capacitorPluginsPath, (plugins) =>
    plugins.filter((plugin) => plugin.pkg !== pushPluginPackage && plugin.classpath !== pushPluginClasspath),
  );
}

function replaceFile(filePath, transform) {
  if (!fs.existsSync(filePath)) return;
  const current = fs.readFileSync(filePath, "utf8");
  const next = transform(current);
  if (next !== current) fs.writeFileSync(filePath, next);
}

function replaceJsonFile(filePath, transform) {
  if (!fs.existsSync(filePath)) return;
  const current = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(current);
  const next = JSON.stringify(transform(parsed), null, "\t");
  if (`${next}\n` !== current) fs.writeFileSync(filePath, `${next}\n`);
}
