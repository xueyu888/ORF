import {
  ChevronLeft,
  ChevronRight,
  Download,
  Grid3X3,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  createContext,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useDraggableFloating } from "../../hooks/useDraggableFloating";
import type { ChatAttachment } from "../../types/orf";
import {
  currentChatAttachmentPreviewImage,
  moveChatAttachmentPreviewImage,
  selectChatAttachmentPreviewImage,
  type ChatAttachmentImagePreviewState,
} from "./chatAttachmentPreview";

type ChatFloatingImagePreviewContextValue = {
  openImagePreview: (preview: ChatAttachmentImagePreviewState) => void;
};
type ChatFloatingImagePreviewSession = {
  preview: ChatAttachmentImagePreviewState;
  sessionId: number;
};
type ChatImageViewerMode = "fit" | "actual";
type ChatImageViewerDrag = {
  pointerId: number;
  scrollLeft: number;
  scrollTop: number;
  x: number;
  y: number;
};
type ChatImageViewerState = {
  expanded: boolean;
  mode: ChatImageViewerMode;
  rotation: number;
  thumbnailsOpen: boolean;
  zoom: number;
};

const ChatFloatingImagePreviewContext = createContext<ChatFloatingImagePreviewContextValue | null>(null);
const chatImageZoomMin = 0.25;
const chatImageZoomMax = 5;
const chatImageZoomStep = 0.25;

export function ChatFloatingImagePreviewProvider({ children }: { children: ReactNode }) {
  const sessionIdRef = useRef(0);
  const [session, setSession] = useState<ChatFloatingImagePreviewSession | null>(null);
  const openImagePreview = useCallback((nextPreview: ChatAttachmentImagePreviewState) => {
    sessionIdRef.current += 1;
    setSession({ preview: nextPreview, sessionId: sessionIdRef.current });
  }, []);
  const closeImagePreview = useCallback(() => {
    setSession(null);
  }, []);
  const navigateImage = useCallback((direction: -1 | 1) => {
    setSession((current) => current ? {
      ...current,
      preview: moveChatAttachmentPreviewImage(current.preview, direction),
    } : current);
  }, []);
  const selectImage = useCallback((index: number) => {
    setSession((current) => current ? {
      ...current,
      preview: selectChatAttachmentPreviewImage(current.preview, index),
    } : current);
  }, []);
  const value = useMemo(() => ({ openImagePreview }), [openImagePreview]);

  return (
    <ChatFloatingImagePreviewContext.Provider value={value}>
      {children}
      {session && (
        <ChatFloatingImagePreviewWindow
          preview={session.preview}
          sessionId={session.sessionId}
          onClose={closeImagePreview}
          onNavigateImage={navigateImage}
          onSelectImage={selectImage}
        />
      )}
    </ChatFloatingImagePreviewContext.Provider>
  );
}

export function useChatFloatingImagePreview() {
  const context = useContext(ChatFloatingImagePreviewContext);
  if (!context) {
    throw new Error("useChatFloatingImagePreview must be used inside ChatFloatingImagePreviewProvider");
  }
  return context;
}

function ChatFloatingImagePreviewWindow({
  onClose,
  onNavigateImage,
  onSelectImage,
  preview,
  sessionId,
}: {
  onClose: () => void;
  onNavigateImage: (direction: -1 | 1) => void;
  onSelectImage: (index: number) => void;
  preview: ChatAttachmentImagePreviewState;
  sessionId: number;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageDragRef = useRef<ChatImageViewerDrag | null>(null);
  const [draggingImage, setDraggingImage] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ height: number; width: number } | null>(null);
  const [fitSize, setFitSize] = useState<{ height: number; width: number } | null>(null);
  const [viewerState, setViewerState] = useState<ChatImageViewerState>(() => defaultChatImageViewerState(preview.images.length > 1));
  const attachment = currentChatAttachmentPreviewImage(preview);
  const drag = useDraggableFloating<HTMLDivElement>({ resetKey: sessionId });
  const currentIndex = Math.min(Math.max(preview.currentIndex, 0), Math.max(preview.images.length - 1, 0));
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < preview.images.length - 1;
  const zoomPercent = Math.round(viewerState.zoom * 100);

  const updateViewerState = (update: Partial<ChatImageViewerState> | ((current: ChatImageViewerState) => ChatImageViewerState)) => {
    setViewerState((current) => typeof update === "function" ? update(current) : { ...current, ...update });
  };
  const setZoom = (nextZoom: number | ((current: number) => number)) => {
    setViewerState((current) => ({
      ...current,
      zoom: clampChatImageZoom(typeof nextZoom === "function" ? nextZoom(current.zoom) : nextZoom),
    }));
  };
  const zoomOut = () => setZoom((value) => value - chatImageZoomStep);
  const zoomIn = () => setZoom((value) => value + chatImageZoomStep);
  const resetImageTransform = () => {
    setViewerState((current) => ({
      ...current,
      mode: "fit",
      rotation: 0,
      zoom: 1,
    }));
    window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  };
  const toggleImageMode = () => {
    setViewerState((current) => ({
      ...current,
      mode: current.mode === "fit" ? "actual" : "fit",
      zoom: 1,
    }));
  };
  const rotateImage = () => {
    setViewerState((current) => ({
      ...current,
      rotation: (current.rotation + 90) % 360,
      zoom: 1,
    }));
  };
  const handleImageWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((value) => value + (event.deltaY > 0 ? -0.15 : 0.15));
  };
  const startImageDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    imageDragRef.current = {
      pointerId: event.pointerId,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      x: event.clientX,
      y: event.clientY,
    };
    viewport.setPointerCapture(event.pointerId);
    setDraggingImage(true);
  };
  const moveImageDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = imageDragRef.current;
    const viewport = viewportRef.current;
    if (!dragState || !viewport || dragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    viewport.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.x);
    viewport.scrollTop = dragState.scrollTop - (event.clientY - dragState.y);
  };
  const stopImageDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = imageDragRef.current;
    const viewport = viewportRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    imageDragRef.current = null;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    setDraggingImage(false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (isChatImageViewerShortcutEditableTarget(event.target)) return;
      if (event.key === "ArrowLeft" && canGoPrevious) {
        event.preventDefault();
        onNavigateImage(-1);
        return;
      }
      if (event.key === "ArrowRight" && canGoNext) {
        event.preventDefault();
        onNavigateImage(1);
        return;
      }
      if ((event.key === "+" || event.key === "=") && !event.altKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        zoomIn();
        return;
      }
      if (event.key === "-" && !event.altKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        zoomOut();
        return;
      }
      if (event.key === "0" && !event.altKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        resetImageTransform();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGoNext, canGoPrevious, onClose, onNavigateImage, viewerState.zoom]);

  useEffect(() => {
    setViewerState((current) => ({
      ...current,
      mode: "fit",
      rotation: 0,
      thumbnailsOpen: current.thumbnailsOpen && preview.images.length > 1,
      zoom: 1,
    }));
    setNaturalSize(chatAttachmentNaturalSize(attachment));
    setFitSize(null);
    imageDragRef.current = null;
    setDraggingImage(false);
  }, [attachment, preview.images.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !naturalSize) return undefined;

    const updateFitSize = () => {
      const bounds = viewport.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const effectiveNaturalSize = rotatedNaturalSize(naturalSize, viewerState.rotation);
      const scale = viewerState.mode === "fit"
        ? Math.min(bounds.width / effectiveNaturalSize.width, bounds.height / effectiveNaturalSize.height, 1)
        : 1;
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
    observer.observe(viewport);
    window.addEventListener("resize", updateFitSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFitSize);
    };
  }, [naturalSize, viewerState.expanded, viewerState.mode, viewerState.rotation, viewerState.thumbnailsOpen]);

  if (!attachment) {
    return null;
  }

  const imageSize = fitSize
    ? {
        height: Math.max(1, Math.round(fitSize.height * viewerState.zoom)),
        width: Math.max(1, Math.round(fitSize.width * viewerState.zoom)),
      }
    : null;
  const rotated = viewerState.rotation % 180 !== 0;
  const stageStyle: CSSProperties | undefined = imageSize
    ? {
        height: `${rotated ? imageSize.width : imageSize.height}px`,
        width: `${rotated ? imageSize.height : imageSize.width}px`,
      }
    : undefined;
  const imageStyle: CSSProperties | undefined = imageSize
    ? {
        height: `${imageSize.height}px`,
        transform: `rotate(${viewerState.rotation}deg)`,
        width: `${imageSize.width}px`,
      }
    : undefined;

  const windowNode = (
    <div
      aria-label="聊天图片查看器"
      className="orf-chat-floating-image-preview orf-draggable-floating"
      data-expanded={viewerState.expanded ? "true" : "false"}
      ref={drag.ref}
      role="dialog"
      style={drag.style}
    >
      <header className="orf-chat-floating-image-preview-header orf-drag-handle" {...drag.handleProps}>
        <div className="orf-chat-floating-image-preview-tools" data-drag-ignore="true">
          <div className="orf-chat-floating-image-preview-tool-group">
            {preview.images.length > 1 && (
              <>
                <button
                  aria-label="上一张聊天图片"
                  disabled={!canGoPrevious}
                  title="上一张图片"
                  type="button"
                  onClick={() => onNavigateImage(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  aria-label="下一张聊天图片"
                  disabled={!canGoNext}
                  title="下一张图片"
                  type="button"
                  onClick={() => onNavigateImage(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  aria-label={viewerState.thumbnailsOpen ? "隐藏聊天图片缩略图" : "显示聊天图片缩略图"}
                  className={viewerState.thumbnailsOpen ? "is-active" : ""}
                  title={viewerState.thumbnailsOpen ? "隐藏缩略图" : "显示缩略图"}
                  type="button"
                  onClick={() => updateViewerState((current) => ({ ...current, thumbnailsOpen: !current.thumbnailsOpen }))}
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          <div className="orf-chat-floating-image-preview-tool-group">
            <button type="button" onClick={zoomIn} disabled={viewerState.zoom >= chatImageZoomMax} title="放大图片" aria-label="放大图片">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" onClick={zoomOut} disabled={viewerState.zoom <= chatImageZoomMin} title="缩小图片" aria-label="缩小图片">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button type="button" className="orf-chat-image-viewer-text-button" onClick={toggleImageMode} title={viewerState.mode === "fit" ? "按原图大小显示" : "适应窗口显示"} aria-label={viewerState.mode === "fit" ? "按原图大小显示" : "适应窗口显示"}>
              {viewerState.mode === "fit" ? "1:1" : "适应"}
            </button>
            <button type="button" onClick={resetImageTransform} disabled={viewerState.zoom === 1 && viewerState.rotation === 0 && viewerState.mode === "fit"} title="重置图片" aria-label="重置图片">
              <span className="orf-chat-image-viewer-zoom">{zoomPercent}%</span>
            </button>
            <button type="button" onClick={rotateImage} title="顺时针旋转" aria-label="顺时针旋转">
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
          <div className="orf-chat-floating-image-preview-tool-group">
            <a
              aria-label="下载图片"
              download={attachment.fileName}
              href={attachment.contentUrl}
              title="下载图片"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              aria-label={viewerState.expanded ? "还原图片窗口" : "放大图片窗口"}
              title={viewerState.expanded ? "还原窗口" : "放大窗口"}
              type="button"
              onClick={() => updateViewerState((current) => ({ ...current, expanded: !current.expanded }))}
            >
              {viewerState.expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button aria-label="关闭图片窗口" title="关闭" type="button" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <div className="orf-chat-floating-image-preview-title" title={attachment.fileName}>
        <span>{attachment.fileName}</span>
        <small>{currentIndex + 1} / {preview.images.length}</small>
      </div>
      <div
        className={[
          "orf-chat-floating-image-preview-body",
          draggingImage ? "orf-chat-floating-image-preview-body-dragging" : "",
        ].filter(Boolean).join(" ")}
        ref={viewportRef}
        onDoubleClick={resetImageTransform}
        onPointerCancel={stopImageDrag}
        onPointerDown={startImageDrag}
        onPointerLeave={stopImageDrag}
        onPointerMove={moveImageDrag}
        onPointerUp={stopImageDrag}
        onWheel={handleImageWheel}
      >
        <div className="orf-chat-floating-image-preview-stage" style={stageStyle}>
          <img
            alt={attachment.fileName}
            draggable={false}
            src={attachment.contentUrl}
            style={imageStyle}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                setNaturalSize({ height: image.naturalHeight, width: image.naturalWidth });
              }
            }}
          />
        </div>
      </div>
      {preview.images.length > 1 && viewerState.thumbnailsOpen && (
        <div className="orf-chat-floating-image-preview-thumbnails" data-drag-ignore="true">
          {preview.images.map((image, index) => (
            <button
              aria-label={`查看第 ${index + 1} 张聊天图片`}
              className={index === currentIndex ? "is-active" : ""}
              key={image.id}
              type="button"
              onClick={() => onSelectImage(index)}
            >
              <img src={image.contentUrl} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(windowNode, document.body);
}

function defaultChatImageViewerState(hasMultipleImages: boolean): ChatImageViewerState {
  return {
    expanded: false,
    mode: "fit",
    rotation: 0,
    thumbnailsOpen: hasMultipleImages,
    zoom: 1,
  };
}

function chatAttachmentNaturalSize(attachment: ChatAttachment | null) {
  const width = imageDimension(attachment?.width);
  const height = imageDimension(attachment?.height);
  return width && height ? { height, width } : null;
}

function rotatedNaturalSize(size: { height: number; width: number }, rotation: number) {
  return rotation % 180 === 0 ? size : { height: size.width, width: size.height };
}

function imageDimension(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function clampChatImageZoom(value: number) {
  return Math.min(chatImageZoomMax, Math.max(chatImageZoomMin, Math.round(value * 100) / 100));
}

function isChatImageViewerShortcutEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
