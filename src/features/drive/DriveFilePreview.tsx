import { useEffect, useState, type MouseEventHandler } from "react";
import { clsx } from "clsx";
import { Download, File as FileIcon, FileText, Image as ImageIcon, Loader2, X } from "lucide-react";
import mammoth from "mammoth";
import { useParams } from "react-router-dom";
import { IconButton } from "../../components/ui";
import type { Drive, DrivePreviewKind } from "../../types/orf";
import { OrfRichTextMarkdownViewer } from "../rich-text/OrfRichTextMarkdownViewer";
import { drivePreviewKindLabel, drivePreviewUrl, formatDriveFileSize } from "./drivePresentation";

type DriveDocxPreviewState =
  | { status: "loading"; html?: undefined; message?: undefined }
  | { status: "ready"; html: string; message?: string }
  | { status: "error"; html?: undefined; message: string };

type DriveTextPreviewState = {
  error?: string;
  loading: boolean;
  text?: string;
};

type DriveFilePreviewPayload = {
  createdAt: number;
  file: Drive;
  theme: "dark" | "light";
};

const driveFilePreviewPayloadPrefix = "orf:drive-file-preview-popout:";
const driveFilePreviewWindowName = "orf-drive-file-preview-popout";
const driveFilePreviewPayloadMaxAgeMs = 12 * 60 * 60 * 1000;

export function DriveDocxPreview({
  className,
  compact,
  file,
}: {
  className?: string;
  compact?: boolean;
  file: Drive;
}) {
  const previewUrl = file.previewUrl ? drivePreviewUrl(file) : undefined;
  const [state, setState] = useState<DriveDocxPreviewState>({ status: "loading" });

  useEffect(() => {
    if (!previewUrl) {
      setState({ status: "error", message: "当前文件没有可用预览地址" });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(previewUrl, { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`DOCX preview failed with ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            convertImage: mammoth.images.imgElement(async (image) => ({
              src: `data:${image.contentType};base64,${await image.readAsBase64String()}`,
            })),
            externalFileAccess: false,
            includeDefaultStyleMap: true,
            includeEmbeddedStyleMap: true,
          },
        );
        const warning = result.messages.length > 0 ? `${result.messages.length} 条格式提示` : undefined;
        setState({ status: "ready", html: sanitizeDocxHtml(result.value), message: warning });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "DOCX 预览加载失败，请下载文件查看" });
      });
    return () => controller.abort();
  }, [file.id, previewUrl]);

  return (
    <div className={clsx("orf-drive-docx-preview", compact && "is-compact", className)}>
      {state.status === "loading" ? (
        <div className="orf-drive-preview-empty">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>加载 DOCX 预览</span>
        </div>
      ) : state.status === "error" ? (
        <div className="orf-drive-preview-empty">
          <FileText className="h-8 w-8" />
          <span>{state.message}</span>
        </div>
      ) : (
        <>
          {state.message ? <div className="orf-drive-docx-preview-note">{state.message}</div> : null}
          <article className="orf-drive-docx-page" dangerouslySetInnerHTML={{ __html: state.html }} />
        </>
      )}
    </div>
  );
}

export function DriveFilePreviewDialog({ file, onClose }: { file: Drive; onClose: () => void }) {
  return (
    <div className="orf-drive-file-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <DriveFilePreviewChrome
        className="orf-drive-file-preview-window"
        file={file}
        onClose={onClose}
        onMouseDown={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export function DriveFilePreviewPopoutPage() {
  const { popoutId } = useParams<{ popoutId: string }>();
  const [payload] = useState<DriveFilePreviewPayload | null>(() => readDriveFilePreviewPayload(popoutId));

  useEffect(() => {
    if (popoutId) removeDriveFilePreviewPayload(popoutId);
  }, [popoutId]);

  if (!payload) {
    return (
      <main className="orf-drive-file-popout-page" data-chat-theme="light">
        <section className="orf-drive-file-popout-empty" role="alert">
          <h1>文件预览已失效</h1>
          <p>请从 ORF 里重新打开该文件。</p>
          <button type="button" onClick={() => window.close()}>关闭窗口</button>
        </section>
      </main>
    );
  }

  return (
    <main className="orf-drive-file-popout-page" data-chat-theme={payload.theme}>
      <DriveFilePreviewChrome
        className="orf-drive-file-preview-window is-popout"
        file={payload.file}
        onClose={() => window.close()}
      />
    </main>
  );
}

export function DriveFilePreviewSurface({
  file,
  textPreview,
  textPreviewLoading,
}: {
  file: Drive;
  textPreview?: string;
  textPreviewLoading?: boolean;
}) {
  const [markdownViewMode, setMarkdownViewMode] = useState<"rendered" | "source">("rendered");
  const fetchedTextPreview = useDriveTextPreview(file);
  const previewUrl = file.previewUrl ? drivePreviewUrl(file) : undefined;
  const effectiveTextPreview = textPreview ?? fetchedTextPreview.text;
  const effectiveTextLoading = textPreviewLoading ?? fetchedTextPreview.loading;

  useEffect(() => {
    setMarkdownViewMode("rendered");
  }, [file.id]);

  if (file.previewKind === "image" && previewUrl) {
    return (
      <div className="orf-drive-image-preview">
        <img alt={file.fileName} src={previewUrl} />
      </div>
    );
  }

  if (file.previewKind === "markdown" && previewUrl) {
    return (
      <div className="orf-drive-markdown-preview">
        <div className="orf-drive-markdown-toolbar" aria-label="Markdown 预览模式">
          <button type="button" className={clsx(markdownViewMode === "rendered" && "is-active")} onClick={() => setMarkdownViewMode("rendered")}>渲染</button>
          <button type="button" className={clsx(markdownViewMode === "source" && "is-active")} onClick={() => setMarkdownViewMode("source")}>原文</button>
        </div>
        {effectiveTextLoading && effectiveTextPreview === undefined ? (
          <div className="orf-drive-preview-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载预览</div>
        ) : markdownViewMode === "rendered" && effectiveTextPreview ? (
          <div className="orf-drive-markdown-rendered">
            <OrfRichTextMarkdownViewer body={effectiveTextPreview} classNamePrefix="orf-drive-markdown" />
          </div>
        ) : (
          <div className="orf-drive-text-preview is-markdown-source">
            <pre>{effectiveTextPreview ?? fetchedTextPreview.error ?? ""}</pre>
          </div>
        )}
      </div>
    );
  }

  if (file.previewKind === "text" && previewUrl) {
    return (
      <div className="orf-drive-text-preview">
        {effectiveTextLoading && effectiveTextPreview === undefined ? (
          <div className="orf-drive-preview-empty"><Loader2 className="h-5 w-5 animate-spin" /> 加载预览</div>
        ) : (
          <pre>{effectiveTextPreview ?? fetchedTextPreview.error ?? ""}</pre>
        )}
      </div>
    );
  }

  if (file.previewKind === "pdf" && previewUrl) {
    return <iframe className="orf-drive-inline-preview" src={previewUrl} title={file.fileName} />;
  }

  if (file.previewKind === "docx" && previewUrl) {
    return <DriveDocxPreview file={file} />;
  }

  return (
    <div className="orf-drive-preview-empty">
      <FileIcon className="h-8 w-8" />
      <span>无法预览</span>
    </div>
  );
}

export function canOpenDriveFilePreview(file?: Drive | null) {
  return Boolean(file?.previewUrl && file.previewKind !== "download");
}

export function openDriveFilePreviewPopoutWindow(file: Drive) {
  if (typeof window === "undefined" || window.matchMedia("(max-width: 768px)").matches) return false;
  const normalizedFile = normalizeDriveFilePreviewFile(file);
  if (!normalizedFile || !canOpenDriveFilePreview(normalizedFile)) return false;
  const popoutId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const payload: DriveFilePreviewPayload = {
    createdAt: Date.now(),
    file: normalizedFile,
    theme: currentDrivePreviewTheme(),
  };

  try {
    cleanupStaleDriveFilePreviewPayloads();
    window.localStorage.setItem(driveFilePreviewPayloadKey(popoutId), JSON.stringify(payload));
    const popout = window.open(
      `/drive/file-preview-popout/${encodeURIComponent(popoutId)}`,
      driveFilePreviewWindowName,
      driveFilePreviewWindowFeatures(),
    );
    if (!popout) {
      removeDriveFilePreviewPayload(popoutId);
      return false;
    }
    popout.focus();
    return true;
  } catch {
    removeDriveFilePreviewPayload(popoutId);
    return false;
  }
}

function DriveFilePreviewChrome({
  className,
  file,
  onClose,
  onMouseDown,
}: {
  className?: string;
  file: Drive;
  onClose: () => void;
  onMouseDown?: MouseEventHandler<HTMLElement>;
}) {
  const PreviewIcon = driveFilePreviewIcon(file.previewKind);
  return (
    <section className={clsx("orf-drive-file-preview-shell", className)} role="dialog" aria-modal="true" aria-label={`${file.fileName} 文件预览`} onMouseDown={onMouseDown}>
      <header className="orf-drive-file-preview-header">
        <div className="orf-drive-file-preview-title">
          <PreviewIcon className="h-5 w-5" />
          <span>
            <strong title={file.fileName}>{file.fileName}</strong>
            <small>{drivePreviewKindLabel(file.previewKind)} · {formatDriveFileSize(file.fileSize)}</small>
          </span>
        </div>
        <div className="orf-drive-file-preview-actions">
          <a href={file.downloadUrl}>
            <Download className="h-4 w-4" />
            下载
          </a>
          <IconButton icon={X} label="关闭预览" size="sm" variant="ghost" onClick={onClose} />
        </div>
      </header>
      <div className="orf-drive-file-preview-body">
        <DriveFilePreviewSurface file={file} />
      </div>
    </section>
  );
}

function useDriveTextPreview(file: Drive): DriveTextPreviewState {
  const [state, setState] = useState<DriveTextPreviewState>({ loading: false });
  const previewUrl = file.previewUrl ? drivePreviewUrl(file) : undefined;

  useEffect(() => {
    if (!previewUrl || (file.previewKind !== "markdown" && file.previewKind !== "text")) {
      setState({ loading: false });
      return undefined;
    }
    const controller = new AbortController();
    setState({ loading: true });
    fetch(previewUrl, { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Text preview failed with ${response.status}`);
        const text = await response.text();
        setState({ loading: false, text: text.slice(0, 200_000) });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ error: "预览加载失败", loading: false });
      });
    return () => controller.abort();
  }, [file.id, file.previewKind, previewUrl]);

  return state;
}

function driveFilePreviewIcon(kind: DrivePreviewKind) {
  if (kind === "image") return ImageIcon;
  if (kind === "download") return FileIcon;
  return FileText;
}

function sanitizeDocxHtml(html: string) {
  const document = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  const root = document.body.firstElementChild ?? document.body;
  sanitizeDocxNode(root, document);
  return root.innerHTML;
}

function sanitizeDocxNode(node: Node, document: Document) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.parentNode?.removeChild(child);
      continue;
    }
    const element = child as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    if (!allowedDocxTags.has(tagName)) {
      const fragment = document.createDocumentFragment();
      while (element.firstChild) fragment.appendChild(element.firstChild);
      element.replaceWith(fragment);
      sanitizeDocxNode(node, document);
      continue;
    }
    sanitizeDocxElementAttributes(element, tagName);
    sanitizeDocxNode(element, document);
  }
}

const allowedDocxTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

function sanitizeDocxElementAttributes(element: HTMLElement, tagName: string) {
  const href = element.getAttribute("href") ?? "";
  const src = element.getAttribute("src") ?? "";
  const alt = element.getAttribute("alt") ?? "";
  const colSpan = element.getAttribute("colspan") ?? "";
  const rowSpan = element.getAttribute("rowspan") ?? "";
  for (const attribute of Array.from(element.attributes)) {
    element.removeAttribute(attribute.name);
  }

  if (tagName === "a") {
    if (isSafeDocxHref(href)) {
      element.setAttribute("href", href);
      element.setAttribute("rel", "noopener noreferrer");
      element.setAttribute("target", "_blank");
    }
  }

  if (tagName === "img") {
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src)) {
      element.setAttribute("src", src);
      if (alt) element.setAttribute("alt", alt.slice(0, 160));
    } else {
      element.remove();
    }
  }

  if (tagName === "td" || tagName === "th") {
    setSafeSpanAttribute(element, "colspan", colSpan);
    setSafeSpanAttribute(element, "rowspan", rowSpan);
  }
}

function setSafeSpanAttribute(element: HTMLElement, name: "colspan" | "rowspan", rawValue: string) {
  const value = Number(rawValue);
  if (Number.isInteger(value) && value > 1 && value <= 20) {
    element.setAttribute(name, String(value));
  }
}

function isSafeDocxHref(value: string) {
  if (!value || value.startsWith("#")) return true;
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function normalizeDriveFilePreviewFile(value: unknown): Drive | null {
  if (!value || typeof value !== "object") return null;
  const file = value as Partial<Drive>;
  const id = safeDrivePreviewText(file.id);
  const fileName = safeDrivePreviewText(file.fileName);
  const mimeType = safeDrivePreviewText(file.mimeType);
  const contentUrl = safeDrivePreviewText(file.contentUrl);
  const downloadUrl = safeDrivePreviewText(file.downloadUrl);
  const previewKind = safeDrivePreviewKind(file.previewKind);
  const previewUrl = safeDrivePreviewText(file.previewUrl);
  if (!id || !fileName || !contentUrl || !downloadUrl || !previewKind) return null;
  return {
    id,
    fileName,
    mimeType: mimeType || "application/octet-stream",
    fileSize: safeDrivePreviewNumber(file.fileSize) ?? 0,
    contentUrl,
    downloadUrl,
    previewKind,
    previewUrl: previewUrl || undefined,
    width: safeDrivePreviewNumber(file.width),
    height: safeDrivePreviewNumber(file.height),
    createdBy: safeDrivePreviewText(file.createdBy) || null,
    createdByName: safeDrivePreviewText(file.createdByName) || null,
    createdAt: safeDrivePreviewText(file.createdAt),
    latestVersionNumber: safeDrivePreviewNumber(file.latestVersionNumber) ?? undefined,
    versionCount: safeDrivePreviewNumber(file.versionCount) ?? undefined,
  };
}

function readDriveFilePreviewPayload(popoutId?: string) {
  if (!popoutId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(driveFilePreviewPayloadKey(popoutId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DriveFilePreviewPayload>;
    const file = normalizeDriveFilePreviewFile(parsed.file);
    const createdAt = typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt) ? parsed.createdAt : 0;
    if (!file || Date.now() - createdAt > driveFilePreviewPayloadMaxAgeMs) {
      removeDriveFilePreviewPayload(popoutId);
      return null;
    }
    const theme: DriveFilePreviewPayload["theme"] = parsed.theme === "dark" ? "dark" : "light";
    return {
      createdAt,
      file,
      theme,
    };
  } catch {
    return null;
  }
}

function currentDrivePreviewTheme() {
  if (typeof document === "undefined") return "light";
  return document.querySelector(".orf-app-shell")?.getAttribute("data-chat-theme") === "dark" ? "dark" : "light";
}

function driveFilePreviewPayloadKey(popoutId: string) {
  return `${driveFilePreviewPayloadPrefix}${popoutId}`;
}

function removeDriveFilePreviewPayload(popoutId: string) {
  try {
    window.localStorage.removeItem(driveFilePreviewPayloadKey(popoutId));
  } catch {
    // Temporary preview payload cleanup is best-effort.
  }
}

function cleanupStaleDriveFilePreviewPayloads() {
  try {
    const now = Date.now();
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(driveFilePreviewPayloadPrefix)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<DriveFilePreviewPayload>;
      const createdAt = typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt) ? parsed.createdAt : 0;
      if (!normalizeDriveFilePreviewFile(parsed.file) || now - createdAt > driveFilePreviewPayloadMaxAgeMs) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Temporary preview payload cleanup is best-effort.
  }
}

function driveFilePreviewWindowFeatures() {
  const screenWidth = typeof window.screen?.availWidth === "number" ? window.screen.availWidth : window.innerWidth;
  const screenHeight = typeof window.screen?.availHeight === "number" ? window.screen.availHeight : window.innerHeight;
  const width = Math.min(1280, Math.max(960, Math.round(screenWidth * 0.86)));
  const height = Math.min(900, Math.max(720, Math.round(screenHeight * 0.88)));
  const left = Math.max(0, Math.round((screenWidth - width) / 2));
  const top = Math.max(0, Math.round((screenHeight - height) / 2));
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

function safeDrivePreviewText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeDrivePreviewNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeDrivePreviewKind(value: unknown): DrivePreviewKind | null {
  return value === "download"
    || value === "docx"
    || value === "image"
    || value === "markdown"
    || value === "pdf"
    || value === "text"
    ? value
    : null;
}
