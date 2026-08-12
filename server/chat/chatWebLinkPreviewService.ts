import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList } from "node:net";
import iconv from "iconv-lite";
import type { ChatWebLinkPreview } from "../../src/domain/chatWebLinkPreview";

const requestTimeoutMs = 5_000;
const maxHtmlBytes = 512 * 1024;
const maxRedirects = 3;

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

type PageResponse =
  | { kind: "html"; body: Buffer; contentType: string }
  | { kind: "redirect"; location: string };

function normalizedWebUrl(value: string) {
  const url = new URL(value);
  const expectedPort = url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : null;
  if (!expectedPort || url.username || url.password || (url.port && url.port !== expectedPort)) {
    throw new Error("Unsupported web preview URL");
  }
  url.hash = "";
  return url;
}

async function publicAddressFor(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) => (
      (family === 6 && address.toLowerCase().startsWith("::ffff:")) ||
      blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6")
    ))
  ) {
    throw new Error("Web preview URL does not resolve to a public address");
  }
  return addresses[0];
}

async function requestPage(url: URL, signal: AbortSignal): Promise<PageResponse> {
  const address = await publicAddressFor(url.hostname);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const outgoing = request({
      agent: false,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Host: url.host,
        "User-Agent": "ORF-Web-Preview/1.0",
      },
      hostname: address.address,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      servername: url.protocol === "https:" ? url.hostname : undefined,
      signal,
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        resolve({ kind: "redirect", location });
        return;
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Web preview request failed with status ${statusCode}`));
        return;
      }

      const contentType = String(response.headers["content-type"] ?? "");
      if (!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/iu.test(contentType)) {
        response.resume();
        reject(new Error("Web preview response is not HTML"));
        return;
      }

      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      let tagTail = "";
      response.on("data", (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxHtmlBytes) {
          response.destroy(new Error("Web preview response is too large"));
          return;
        }
        chunks.push(chunk);
        const tagScan = `${tagTail}${chunk.toString("latin1")}`;
        if (/<\/head\s*>/iu.test(tagScan)) {
          const body = Buffer.concat(chunks);
          response.destroy();
          resolve({ body, contentType, kind: "html" });
          return;
        }
        tagTail = tagScan.slice(-16);
      });
      response.once("end", () => resolve({
        body: Buffer.concat(chunks),
        contentType,
        kind: "html",
      }));
      response.once("error", reject);
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

async function loadHtml(initialUrl: string) {
  const signal = AbortSignal.timeout(requestTimeoutMs);
  let url = normalizedWebUrl(initialUrl);
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await requestPage(url, signal);
    if (response.kind === "html") {
      return { ...response, url };
    }
    if (redirectCount === maxRedirects) {
      throw new Error("Web preview redirected too many times");
    }
    url = normalizedWebUrl(new URL(response.location, url).href);
  }
  throw new Error("Web preview could not be loaded");
}

function pageEncoding(contentType: string, body: Buffer) {
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/iu)?.[1];
  const head = body.subarray(0, 8_192).toString("latin1");
  const metaCharset = head.match(/<meta\b[^>]*charset\s*=\s*["']?([^\s"'/>]+)/iu)?.[1]
    ?? head.match(/<meta\b[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([^\s;"']+)/iu)?.[1];
  const encoding = headerCharset ?? metaCharset ?? "utf-8";
  return iconv.encodingExists(encoding) ? encoding : "utf-8";
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (entity, decimal, hexadecimal, named) => {
    const codePoint = decimal ? Number(decimal) : hexadecimal ? Number.parseInt(hexadecimal, 16) : null;
    if (codePoint !== null) {
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    }
    return namedEntities[String(named).toLowerCase()] ?? entity;
  });
}

function cleanText(value: string | undefined, maxLength: number) {
  if (!value) return null;
  const text = decodeHtmlEntities(value)
    .replace(/<[^>]*>/gu, " ")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function tagAttributes(source: string) {
  const attributes = new Map<string, string>();
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of source.matchAll(attributePattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function pageMetadata(html: string, url: URL): ChatWebLinkPreview {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/iu)?.[1] ?? html.slice(0, 192_000);
  const metadata = new Map<string, string>();
  for (const match of head.matchAll(/<meta\b([^>]*)>/giu)) {
    const attributes = tagAttributes(match[1]);
    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    const content = attributes.get("content");
    if (key && content && !metadata.has(key)) metadata.set(key, content);
  }

  const hostname = url.hostname.replace(/^www\./iu, "");
  const title = cleanText(
    metadata.get("og:title") ?? metadata.get("twitter:title") ?? head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1],
    240,
  ) ?? hostname;
  const description = cleanText(
    metadata.get("og:description") ?? metadata.get("twitter:description") ?? metadata.get("description"),
    500,
  );
  const siteName = cleanText(metadata.get("og:site_name"), 120) ?? hostname;
  return { description, hostname, siteName, title, url: url.href };
}

export async function loadChatWebLinkPreview(url: string): Promise<ChatWebLinkPreview> {
  const page = await loadHtml(url);
  const html = iconv.decode(page.body, pageEncoding(page.contentType, page.body));
  return pageMetadata(html, page.url);
}
