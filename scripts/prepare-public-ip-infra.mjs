#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(rootDir, ".env");
const infraDir = path.join(rootDir, "infra", "public-ip");
const nginxDir = path.join(infraDir, "nginx");
const confDir = path.join(nginxDir, "conf.d");
const snippetsDir = path.join(nginxDir, "snippets");
const webrootDir = path.join(infraDir, "certbot", "www");
const letsEncryptDir = path.join(infraDir, "letsencrypt");
const bootstrapCertDir = path.join(infraDir, "bootstrap-certs");
const fullchainFile = path.join(bootstrapCertDir, "fullchain.pem");
const privateKeyFile = path.join(bootstrapCertDir, "privkey.pem");
const bootstrapIpFile = path.join(bootstrapCertDir, "ip.txt");

const composeCertDir = "/etc/letsencrypt";
const composeBootstrapDir = "/etc/nginx/bootstrap-certs";

function main() {
  const env = readEnvFile(envFile);
  const publicIp = readArg("--public-ip") ?? env.ORF_PUBLIC_IP ?? process.env.ORF_PUBLIC_IP;
  if (!publicIp || net.isIP(publicIp) === 0) {
    throw new Error("ORF_PUBLIC_IP is required. Run `npm run infra:public:env -- --public-ip <ip>` first.");
  }
  const gatewayCertIps = collectGatewayCertIps(publicIp, env);

  const oryPort = env.ORY_PUBLIC_EXTERNAL_PORT ?? "18443";
  const storagePort = env.OBJECT_STORAGE_EXTERNAL_PORT ?? "19443";
  const webPort = env.ORF_WEB_EXTERNAL_PORT ?? "8443";
  const webDomain = normalizeWebDomain(env.ORF_DUCKDNS_DOMAIN ?? env.ORF_WEB_DOMAIN ?? process.env.ORF_DUCKDNS_DOMAIN ?? process.env.ORF_WEB_DOMAIN);
  const frontendUpstream = env.ORF_FRONTEND_UPSTREAM ?? process.env.ORF_FRONTEND_UPSTREAM ?? "http://host.docker.internal:5173";
  const backendUpstream = env.ORF_BACKEND_UPSTREAM ?? process.env.ORF_BACKEND_UPSTREAM ?? "http://host.docker.internal:8787";

  for (const dir of [confDir, snippetsDir, webrootDir, letsEncryptDir, bootstrapCertDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  ensureBootstrapCertificate(publicIp, gatewayCertIps);
  writeSslSnippet();
  writeNginxConfig({ backendUpstream, frontendUpstream, oryPort, publicIp, storagePort, webDomain, webPort });

  console.log(`Prepared public IP gateway config for ${publicIp}.`);
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) {
    return {};
  }

  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    values[match[1]] = unquoteEnvValue(match[2]);
  }
  return values;
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return value;
}

function normalizeWebDomain(value) {
  const domain = value?.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  return domain || undefined;
}

function collectGatewayCertIps(publicIp, env) {
  const extraIps = parseIpList(env.ORF_PUBLIC_GATEWAY_CERT_EXTRA_IPS ?? process.env.ORF_PUBLIC_GATEWAY_CERT_EXTRA_IPS);
  const certIps = [];
  for (const ip of [publicIp, ...extraIps]) {
    if (net.isIP(ip) === 0) {
      throw new Error(`Invalid public gateway certificate IP: ${ip}`);
    }
    if (!certIps.includes(ip)) {
      certIps.push(ip);
    }
  }
  return certIps;
}

function parseIpList(value) {
  return value?.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function ensureBootstrapCertificate(publicIp, certIps) {
  const certIpState = `${certIps.join("\n")}\n`;
  if (
    fs.existsSync(fullchainFile) &&
    fs.existsSync(privateKeyFile) &&
    fs.existsSync(bootstrapIpFile) &&
    fs.readFileSync(bootstrapIpFile, "utf8") === certIpState &&
    certificateRemainsValid(fullchainFile)
  ) {
    return;
  }

  childProcess.execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-days",
      "397",
      "-subj",
      `/CN=${publicIp}`,
      "-addext",
      `subjectAltName=${certIps.map((ip) => `IP:${ip}`).join(",")}`,
      "-keyout",
      privateKeyFile,
      "-out",
      fullchainFile,
    ],
    { stdio: "ignore" },
  );
  fs.chmodSync(privateKeyFile, 0o600);
  fs.writeFileSync(bootstrapIpFile, certIpState);
}

function certificateRemainsValid(certFile) {
  const result = childProcess.spawnSync("openssl", ["x509", "-checkend", String(30 * 24 * 60 * 60), "-noout", "-in", certFile], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function activeCertPaths(publicIp) {
  const liveDir = path.join(letsEncryptDir, "live", publicIp);
  const issuedFullchain = path.join(liveDir, "fullchain.pem");
  const issuedPrivateKey = path.join(liveDir, "privkey.pem");
  if (fs.existsSync(issuedFullchain) && fs.existsSync(issuedPrivateKey)) {
    return {
      fullchain: `${composeCertDir}/live/${publicIp}/fullchain.pem`,
      privateKey: `${composeCertDir}/live/${publicIp}/privkey.pem`,
    };
  }

  return {
    fullchain: `${composeBootstrapDir}/fullchain.pem`,
    privateKey: `${composeBootstrapDir}/privkey.pem`,
  };
}

function activeWebCertPaths(webDomain, publicIp) {
  if (webDomain) {
    const liveDir = path.join(letsEncryptDir, "live", webDomain);
    const issuedFullchain = path.join(liveDir, "fullchain.pem");
    const issuedPrivateKey = path.join(liveDir, "privkey.pem");
    if (fs.existsSync(issuedFullchain) && fs.existsSync(issuedPrivateKey)) {
      return {
        fullchain: `${composeCertDir}/live/${webDomain}/fullchain.pem`,
        privateKey: `${composeCertDir}/live/${webDomain}/privkey.pem`,
      };
    }
  }

  return activeCertPaths(publicIp);
}

function writeSslSnippet() {
  fs.writeFileSync(
    path.join(snippetsDir, "orf-ssl.conf"),
    [
      "ssl_protocols TLSv1.2 TLSv1.3;",
      "ssl_prefer_server_ciphers off;",
      "ssl_session_cache shared:ORFSSL:10m;",
      "ssl_session_timeout 10m;",
      "add_header X-Content-Type-Options nosniff always;",
      "",
    ].join("\n"),
  );
}

function writeNginxConfig({ backendUpstream, frontendUpstream, oryPort, publicIp, storagePort, webDomain, webPort }) {
  const cert = activeCertPaths(publicIp);
  const webCert = activeWebCertPaths(webDomain, publicIp);
  const webServerName = webDomain ?? "_";
  fs.writeFileSync(
    path.join(confDir, "orf-public-ip.conf"),
    [
      "server {",
      "  listen 80 default_server;",
      "  server_name _;",
      "",
      "  location ^~ /.well-known/acme-challenge/ {",
      "    root /var/www/certbot;",
      "    default_type text/plain;",
      "    try_files $uri =404;",
      "  }",
      "",
      "  location / {",
      "    return 404;",
      "  }",
      "}",
      "",
      "server {",
      "  listen 443 ssl default_server;",
      "  server_name _;",
      `  ssl_certificate ${cert.fullchain};`,
      `  ssl_certificate_key ${cert.privateKey};`,
      "  include /etc/nginx/snippets/orf-ssl.conf;",
      "",
      "  location / {",
      "    return 404;",
      "  }",
      "}",
      "",
      "server {",
      `  listen ${webPort} ssl;`,
      `  server_name ${webServerName};`,
      `  ssl_certificate ${webCert.fullchain};`,
      `  ssl_certificate_key ${webCert.privateKey};`,
      "  include /etc/nginx/snippets/orf-ssl.conf;",
      "  client_max_body_size 110m;",
      "",
      "  location /api/ {",
      "    proxy_http_version 1.1;",
      "    proxy_set_header Host $http_host;",
      "    proxy_set_header X-Real-IP $remote_addr;",
      "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "    proxy_set_header X-Forwarded-Proto https;",
      `    proxy_pass ${backendUpstream};`,
      "  }",
      "",
      "  location = /health {",
      "    proxy_http_version 1.1;",
      "    proxy_set_header Host $http_host;",
      "    proxy_set_header X-Real-IP $remote_addr;",
      "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "    proxy_set_header X-Forwarded-Proto https;",
      `    proxy_pass ${backendUpstream};`,
      "  }",
      "",
      "  location /settings/backgrounds/ {",
      "    proxy_http_version 1.1;",
      "    proxy_set_header Host $http_host;",
      "    proxy_set_header X-Real-IP $remote_addr;",
      "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "    proxy_set_header X-Forwarded-Proto https;",
      `    proxy_pass ${backendUpstream};`,
      "  }",
      "",
      "  location / {",
      "    proxy_http_version 1.1;",
      "    proxy_set_header Host $http_host;",
      "    proxy_set_header X-Real-IP $remote_addr;",
      "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "    proxy_set_header X-Forwarded-Proto https;",
      "    proxy_set_header Upgrade $http_upgrade;",
      "    proxy_set_header Connection \"upgrade\";",
      `    proxy_pass ${frontendUpstream};`,
      "  }",
      "}",
      "",
      "server {",
      `  listen ${oryPort} ssl;`,
      "  server_name _;",
      `  ssl_certificate ${cert.fullchain};`,
      `  ssl_certificate_key ${cert.privateKey};`,
      "  include /etc/nginx/snippets/orf-ssl.conf;",
      "  client_max_body_size 1m;",
      "",
      "  location / {",
      "    proxy_http_version 1.1;",
      "    proxy_set_header Host $http_host;",
      "    proxy_set_header X-Real-IP $remote_addr;",
      "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "    proxy_set_header X-Forwarded-Proto https;",
      "    proxy_pass http://kratos:4433;",
      "  }",
      "}",
      "",
      "server {",
      `  listen ${storagePort} ssl;`,
      "  server_name _;",
      `  ssl_certificate ${cert.fullchain};`,
      `  ssl_certificate_key ${cert.privateKey};`,
      "  include /etc/nginx/snippets/orf-ssl.conf;",
      "  client_max_body_size 12m;",
      "",
      "  location / {",
      "    proxy_http_version 1.1;",
      "    proxy_set_header Host $http_host;",
      "    proxy_set_header X-Real-IP $remote_addr;",
      "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "    proxy_set_header X-Forwarded-Proto https;",
      "    proxy_connect_timeout 300s;",
      "    proxy_send_timeout 300s;",
      "    proxy_read_timeout 300s;",
      "    proxy_pass http://minio:9000;",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
