import { Check, ChevronLeft, ChevronRight, Copy, Download, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { type CSSProperties, type PointerEvent, type WheelEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ImagePreview = {
  alt: string;
  copySourceUrl?: string | null;
  downloadFileName?: string | null;
  downloadUrl?: string | null;
  height?: number | null;
  label: string;
  mimeType?: string | null;
  src: string;
  width?: number | null;
};

export type ImagePreviewNavigation = {
  canGoNext: boolean;
  canGoPrevious: boolean;
  counterLabel: string;
  onGoNext: () => void;
  onGoPrevious: () => void;
};

type ImagePreviewSwipe = {
  pointerId: number;
  x: number;
  y: number;
};

const imagePreviewSwipeMinDistancePx = 48;
const imagePreviewSwipeDominance = 1.35;

export function ImagePreviewDialog({
  navigation,
  onClose,
  preview,
}: {
  navigation?: ImagePreviewNavigation;
  onClose: () => void;
  preview: ImagePreview;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const imageViewportRef = useRef<HTMLDivElement | null>(null);
  const imageDragRef = useRef<{ pointerId: number; scrollLeft: number; scrollTop: number; x: number; y: number } | null>(null);
  const imageSwipeRef = useRef<ImagePreviewSwipe | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ height: number; width: number } | null>(() => imagePreviewNaturalSize(preview));
  const [fitSize, setFitSize] = useState<{ height: number; width: number } | null>(null);
  const zoomPercent = Math.round(zoom * 100);
  const copySourceUrl = preview.copySourceUrl ?? null;
  const downloadUrl = preview.downloadUrl ?? null;
  const downloadFileName = preview.downloadFileName ?? preview.label;
  const canNavigateImages = Boolean(navigation);
  const previewIdentity = [
    preview.alt,
    preview.copySourceUrl ?? "",
    preview.downloadFileName ?? "",
    preview.downloadUrl ?? "",
    preview.height ?? "",
    preview.label,
    preview.mimeType ?? "",
    preview.src,
    preview.width ?? "",
  ].join("\n");

  const goToPrevious = () => {
    if (!navigation?.canGoPrevious) return;
    navigation.onGoPrevious();
  };
  const goToNext = () => {
    if (!navigation?.canGoNext) return;
    navigation.onGoNext();
  };

  const setZoomLevel = (update: number | ((current: number) => number), anchor?: { clientX: number; clientY: number }) => {
    setZoom((current) => {
      const next = clampImagePreviewZoom(typeof update === "function" ? update(current) : update);
      const viewport = imageViewportRef.current;
      if (next !== current && viewport && anchor) {
        const bounds = viewport.getBoundingClientRect();
        const anchorX = anchor.clientX - bounds.left;
        const anchorY = anchor.clientY - bounds.top;
        const contentX = viewport.scrollLeft + anchorX;
        const contentY = viewport.scrollTop + anchorY;
        const scale = next / current;
        window.requestAnimationFrame(() => {
          viewport.scrollLeft = contentX * scale - anchorX;
          viewport.scrollTop = contentY * scale - anchorY;
        });
      }
      return next;
    });
  };
  const zoomOut = () => setZoomLevel((value) => value - 0.25);
  const zoomIn = () => setZoomLevel((value) => value + 0.25);
  const resetZoom = () => {
    setZoomLevel(1);
    window.requestAnimationFrame(() => {
      const viewport = imageViewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  };
  const handleImageWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoomLevel((value) => value + direction * 0.15, { clientX: event.clientX, clientY: event.clientY });
  };
  const startImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const viewport = imageViewportRef.current;
    if (!viewport) return;
    if (canNavigateImages && zoom === 1 && event.pointerType !== "mouse") {
      imageSwipeRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      viewport.setPointerCapture(event.pointerId);
      return;
    }
    imageDragRef.current = {
      pointerId: event.pointerId,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      x: event.clientX,
      y: event.clientY,
    };
    viewport.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = imageSwipeRef.current;
    if (swipe?.pointerId === event.pointerId) {
      const deltaX = event.clientX - swipe.x;
      const deltaY = event.clientY - swipe.y;
      if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
        event.preventDefault();
      }
      return;
    }

    const drag = imageDragRef.current;
    const viewport = imageViewportRef.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    viewport.scrollTop = drag.scrollTop - (event.clientY - drag.y);
  };
  const stopImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = imageSwipeRef.current;
    const viewport = imageViewportRef.current;
    if (swipe?.pointerId === event.pointerId) {
      imageSwipeRef.current = null;
      if (viewport?.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
      const deltaX = event.clientX - swipe.x;
      const deltaY = event.clientY - swipe.y;
      const isSwipe = (
        event.type !== "pointercancel" &&
        event.type !== "pointerleave" &&
        Math.abs(deltaX) >= imagePreviewSwipeMinDistancePx &&
        Math.abs(deltaX) > Math.abs(deltaY) * imagePreviewSwipeDominance
      );
      if (isSwipe) {
        if (deltaX > 0) {
          goToPrevious();
        } else {
          goToNext();
        }
      }
      return;
    }

    const drag = imageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    imageDragRef.current = null;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };
  const copyImage = async () => {
    if (!copySourceUrl || copyStatus === "copying") return;
    setCopyStatus("copying");
    try {
      await copyPreviewImage({ mimeType: preview.mimeType, src: copySourceUrl });
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => setCopyStatus("idle"), 1800);
  };

  useEffect(() => {
    const handlePreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        if (navigation?.canGoPrevious) {
          event.preventDefault();
          navigation.onGoPrevious();
        }
        return;
      }
      if (event.key === "ArrowRight" && navigation?.canGoNext) {
        event.preventDefault();
        navigation.onGoNext();
      }
    };

    window.addEventListener("keydown", handlePreviewKeyDown);
    return () => window.removeEventListener("keydown", handlePreviewKeyDown);
  }, [navigation, onClose]);

  useEffect(() => {
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    setZoom(1);
    setCopyStatus("idle");
    setDragging(false);
    imageDragRef.current = null;
    imageSwipeRef.current = null;
    setNaturalSize(imagePreviewNaturalSize(preview));
    setFitSize(null);
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
  }, [previewIdentity]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const element = imageViewportRef.current;
    if (!element || !naturalSize) return undefined;

    const updateFitSize = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const scale = Math.min(bounds.width / naturalSize.width, bounds.height / naturalSize.height, 1);
      const next = {
        height: Math.max(1, Math.round(naturalSize.height * scale)),
        width: Math.max(1, Math.round(naturalSize.width * scale)),
      };
      setFitSize((current) => (
        current?.height === next.height && current.width === next.width ? current : next
      ));
    };

    updateFitSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFitSize);
      return () => window.removeEventListener("resize", updateFitSize);
    }

    const observer = new ResizeObserver(updateFitSize);
    observer.observe(element);
    window.addEventListener("resize", updateFitSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFitSize);
    };
  }, [naturalSize]);

  const imageSizeStyle: CSSProperties | undefined = fitSize
    ? {
        height: `${Math.round(fitSize.height * zoom)}px`,
        width: `${Math.round(fitSize.width * zoom)}px`,
      }
    : undefined;

  return createPortal(
    <div className="orf-image-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="orf-image-preview-dialog"
        role="dialog"
        aria-label={preview.label}
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="orf-image-preview-toolbar">
          <span>{preview.label}</span>
          <div className="orf-image-preview-actions" aria-label="图片查看工具">
            {navigation && (
              <>
                <button type="button" onClick={goToPrevious} disabled={!navigation.canGoPrevious} title="上一张图片" aria-label="上一张图片">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="orf-image-preview-counter">{navigation.counterLabel}</span>
                <button type="button" onClick={goToNext} disabled={!navigation.canGoNext} title="下一张图片" aria-label="下一张图片">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
            <button type="button" onClick={zoomOut} disabled={zoom <= 0.25} title="缩小图片" aria-label="缩小图片">
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="orf-image-preview-zoom-value">{zoomPercent}%</span>
            <button type="button" onClick={zoomIn} disabled={zoom >= 5} title="放大图片" aria-label="放大图片">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" onClick={resetZoom} disabled={zoom === 1} title="重置缩放" aria-label="重置缩放">
              <RotateCcw className="h-4 w-4" />
            </button>
            {copySourceUrl && (
              <button type="button" onClick={() => void copyImage()} disabled={copyStatus === "copying"} title={copyButtonTitle(copyStatus)} aria-label={copyButtonTitle(copyStatus)}>
                {copyStatus === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            )}
            {downloadUrl && (
              <a href={downloadUrl} download={downloadFileName} title="下载图片" aria-label="下载图片">
                <Download className="h-4 w-4" />
              </a>
            )}
            <button type="button" aria-label="关闭图片预览" title="关闭" onClick={onClose}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        {navigation && (
          <div className="orf-image-preview-side-navigation" aria-label="图片翻页">
            <button
              type="button"
              className="orf-image-preview-side-button orf-image-preview-side-button-previous"
              onClick={goToPrevious}
              disabled={!navigation.canGoPrevious}
              title="上一张图片"
              aria-label="上一张图片"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="orf-image-preview-side-button orf-image-preview-side-button-next"
              onClick={goToNext}
              disabled={!navigation.canGoNext}
              title="下一张图片"
              aria-label="下一张图片"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        )}
        <div
          className={["orf-image-preview-viewport", dragging ? "orf-image-preview-viewport-dragging" : ""].filter(Boolean).join(" ")}
          ref={imageViewportRef}
          onDoubleClick={resetZoom}
          onPointerCancel={stopImageDrag}
          onPointerDown={startImageDrag}
          onPointerLeave={stopImageDrag}
          onPointerMove={moveImageDrag}
          onPointerUp={stopImageDrag}
          onWheel={handleImageWheel}
        >
          <img
            className="orf-image-preview"
            src={preview.src}
            alt={preview.alt}
            draggable={false}
            style={imageSizeStyle}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                setNaturalSize({ height: image.naturalHeight, width: image.naturalWidth });
              }
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function imagePreviewNaturalSize(preview: ImagePreview) {
  const width = imageDimension(preview.width);
  const height = imageDimension(preview.height);
  return width && height ? { height, width } : null;
}

function imageDimension(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function clampImagePreviewZoom(value: number) {
  return Math.min(5, Math.max(0.25, Math.round(value * 100) / 100));
}

function copyButtonTitle(status: "idle" | "copying" | "copied" | "failed") {
  if (status === "copying") return "正在复制图片";
  if (status === "copied") return "图片已复制";
  if (status === "failed") return "复制失败";
  return "复制图片";
}

async function copyPreviewImage({ mimeType, src }: { mimeType?: string | null; src: string }) {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image copy is not supported");
  }

  const response = await fetch(src, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Image content request failed");
  }

  const blob = await response.blob();
  const resolvedMimeType = blob.type || mimeType || "image/png";
  const clipboardBlob = blob.type ? blob : blob.slice(0, blob.size, resolvedMimeType);
  await navigator.clipboard.write([new ClipboardItem({ [resolvedMimeType]: clipboardBlob })]);
}
