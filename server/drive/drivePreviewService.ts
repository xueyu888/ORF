import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import iconv from "iconv-lite";
import type { DrivePreviewKind } from "../../src/types/orf";
import { env } from "../env";
import { readImageMetadata } from "../storage/images";

export type DrivePreviewBuildIntent = "legacyOfficePdf" | "textUtf8" | null;

export type DriveStoredPreviewMetadata = {
  height: number | null;
  mimeType: string;
  previewBuildIntent: DrivePreviewBuildIntent;
  previewKind: DrivePreviewKind;
  width: number | null;
};

export type DrivePreviewArtifact = {
  body: Buffer;
  extension: "pdf" | "txt" | "md";
  mimeType: string;
  previewKind: DrivePreviewKind;
};

export type DrivePreviewBuildResult =
  | { artifact: DrivePreviewArtifact; status: "ok" }
  | { error: string; status: "failed" }
  | { status: "skipped" };

export class DrivePreviewSourceTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super("drive preview source is too large");
    this.name = "DrivePreviewSourceTooLargeError";
  }
}

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const cfbHeaderHex = "d0cf11e0a1b11ae1";
const previewableTextFileExtensions = new Set(["csv", "json", "log", "txt"]);
const legacyOfficeFileExtensions = new Set(["doc", "wps"]);
const legacyOfficeMimeTypes = new Set(["application/msword", "application/kswps", "application/wps-office.doc"]);

export function extensionFromFileName(fileName: string) {
  const match = /\.([A-Za-z0-9]{1,16})$/.exec(fileName);
  return match?.[1]?.toLowerCase() ?? "";
}

export function isPdf(buffer: Buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isZipContainer(buffer: Buffer) {
  if (buffer.length < 4) return false;
  const signature = buffer.subarray(0, 4).toString("binary");
  return signature === "PK\u0003\u0004" || signature === "PK\u0005\u0006" || signature === "PK\u0007\b";
}

function isDocx(input: { fileName: string; mimeType: string; peeked: Buffer }) {
  const extension = extensionFromFileName(input.fileName);
  if (extension !== "docx" || !isZipContainer(input.peeked)) return false;
  const normalizedMimeType = normalizeMimeType(input.mimeType);
  return (
    !normalizedMimeType
    || normalizedMimeType === docxMimeType
    || normalizedMimeType === "application/zip"
    || normalizedMimeType === "application/octet-stream"
  );
}

function isLegacyOfficeDocument(input: { fileName: string; mimeType: string; peeked: Buffer }) {
  const extension = extensionFromFileName(input.fileName);
  const normalizedMimeType = normalizeMimeType(input.mimeType);
  return (
    legacyOfficeFileExtensions.has(extension)
    && input.peeked.subarray(0, 8).toString("hex") === cfbHeaderHex
    && (!normalizedMimeType || legacyOfficeMimeTypes.has(normalizedMimeType) || normalizedMimeType === "application/octet-stream")
  );
}

function isMarkdownFile(fileName: string) {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

export function detectDriveStoredPreviewMetadata(input: { fileName: string; mimeType: string; peeked: Buffer }): DriveStoredPreviewMetadata {
  const imageMetadata = readImageMetadata(input.peeked);
  if (imageMetadata) {
    return {
      height: imageMetadata.height ?? null,
      mimeType: imageMetadata.mimeType,
      previewBuildIntent: null,
      previewKind: "image",
      width: imageMetadata.width ?? null,
    };
  }

  const normalizedMimeType = normalizeMimeType(input.mimeType);
  const verifiedPdf = isPdf(input.peeked);
  const verifiedDocx = isDocx(input);
  let mimeType = normalizedMimeType || "application/octet-stream";
  if (verifiedPdf) {
    mimeType = "application/pdf";
  } else if (verifiedDocx) {
    mimeType = docxMimeType;
  } else if (isMarkdownFile(input.fileName)) {
    mimeType = "text/markdown";
  } else if (previewableTextFileExtensions.has(extensionFromFileName(input.fileName))) {
    mimeType = "text/plain";
  }
  if (!verifiedPdf && (normalizedMimeType.startsWith("image/") || normalizedMimeType === "application/pdf")) {
    mimeType = "application/octet-stream";
  }

  if (isLegacyOfficeDocument(input)) {
    return {
      height: null,
      mimeType,
      previewBuildIntent: "legacyOfficePdf",
      previewKind: "download",
      width: null,
    };
  }
  if (verifiedDocx) {
    return {
      height: null,
      mimeType,
      previewBuildIntent: null,
      previewKind: "docx",
      width: null,
    };
  }
  if (verifiedPdf) {
    return {
      height: null,
      mimeType,
      previewBuildIntent: null,
      previewKind: "pdf",
      width: null,
    };
  }
  if (isMarkdownFile(input.fileName)) {
    return {
      height: null,
      mimeType,
      previewBuildIntent: "textUtf8",
      previewKind: "markdown",
      width: null,
    };
  }
  if (previewableTextFileExtensions.has(extensionFromFileName(input.fileName))) {
    return {
      height: null,
      mimeType,
      previewBuildIntent: "textUtf8",
      previewKind: "text",
      width: null,
    };
  }

  return {
    height: null,
    mimeType,
    previewBuildIntent: null,
    previewKind: "download",
    width: null,
  };
}

export async function buildDrivePreviewArtifact(input: {
  body: Buffer;
  fileName: string;
  metadata: DriveStoredPreviewMetadata;
}): Promise<DrivePreviewBuildResult> {
  if (!input.metadata.previewBuildIntent) return { status: "skipped" };
  if (input.body.byteLength > env.ORF_DRIVE_PREVIEW_MAX_BYTES) {
    return { status: "failed", error: `文件超过 ${formatBytes(env.ORF_DRIVE_PREVIEW_MAX_BYTES)}，未生成预览` };
  }
  if (input.metadata.previewBuildIntent === "textUtf8") {
    return {
      artifact: {
        body: Buffer.from(decodeTextPreview(input.body), "utf8"),
        extension: input.metadata.previewKind === "markdown" ? "md" : "txt",
        mimeType: input.metadata.previewKind === "markdown" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
        previewKind: input.metadata.previewKind,
      },
      status: "ok",
    };
  }
  return convertLegacyOfficeToPdf(input.body, input.fileName);
}

function decodeTextPreview(buffer: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, "gb18030");
  }
}

async function convertLegacyOfficeToPdf(buffer: Buffer, fileName: string): Promise<DrivePreviewBuildResult> {
  const tempRoot = path.join(tmpdir(), `orf-drive-preview-${process.pid}-${Date.now()}-${randomUUID()}`);
  const outputDir = path.join(tempRoot, "out");
  const profileDir = path.join(tempRoot, "profile");
  const extension = extensionFromFileName(fileName) || "doc";
  const inputBaseName = `source.${extension}`;
  const inputPath = path.join(tempRoot, inputBaseName);
  const outputPath = path.join(outputDir, "source.pdf");
  try {
    await mkdir(outputDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    await writeFile(inputPath, buffer);
    const result = await runLibreOffice({
      args: [
        `-env:UserInstallation=file://${profileDir}`,
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--nodefault",
        "--nolockcheck",
        "--norestore",
        "--convert-to",
        "pdf",
        "--outdir",
        outputDir,
        inputPath,
      ],
    });
    if (result.status !== "ok") return result;
    const body = await readFile(outputPath);
    if (!isPdf(body)) return { status: "failed", error: "LibreOffice 未生成有效 PDF 预览" };
    return {
      artifact: {
        body,
        extension: "pdf",
        mimeType: "application/pdf",
        previewKind: "pdf",
      },
      status: "ok",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", error: `Office/WPS 预览转换失败：${message}` };
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runLibreOffice(input: { args: string[] }): Promise<{ status: "ok" } | { error: string; status: "failed" }> {
  const candidates = uniqueCommands([env.ORF_DRIVE_PREVIEW_LIBREOFFICE_BIN, "soffice", "libreoffice"]);
  return runLibreOfficeCandidate(candidates, input.args, 0);
}

function runLibreOfficeCandidate(
  candidates: string[],
  args: string[],
  index: number,
): Promise<{ status: "ok" } | { error: string; status: "failed" }> {
  const command = candidates[index];
  if (!command) return Promise.resolve({ status: "failed", error: "LibreOffice 未安装或不可执行" });
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        HOME: tmpdir(),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ status: "failed", error: `LibreOffice 转换超过 ${Math.round(env.ORF_DRIVE_PREVIEW_CONVERSION_TIMEOUT_MS / 1000)} 秒` });
    }, env.ORF_DRIVE_PREVIEW_CONVERSION_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (error.code === "ENOENT") {
        resolve(runLibreOfficeCandidate(candidates, args, index + 1));
        return;
      }
      resolve({ status: "failed", error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ status: "ok" });
        return;
      }
      const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join(" ").slice(0, 300);
      resolve({ status: "failed", error: detail || `LibreOffice 退出码 ${code}` });
    });
  });
}

function uniqueCommands(commands: Array<string | undefined>) {
  return commands.map((command) => command?.trim()).filter((command): command is string => Boolean(command)).filter((command, index, list) => list.indexOf(command) === index);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
