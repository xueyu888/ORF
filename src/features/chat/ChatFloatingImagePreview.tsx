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
  type MouseEvent as ReactMouseEvent,
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
import { useParams } from "react-router-dom";
import { ImageCopyButton } from "../../components/ImageCopyButton";
import type { ChatAttachment } from "../../types/orf";
import { toggleMaximizeDesktopWindow } from "../desktop/desktopShellRuntime";
import {
  currentChatAttachmentPreviewImage,
  moveChatAttachmentPreviewImage,
  selectChatAttachmentPreviewImage,
  type ChatAttachmentImagePreviewState,
} from "./chatAttachmentPreview";
import { chatMobileViewportQuery } from "./useChatMobileViewport";

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
type ChatImageWindowMode = "normal" | "maximized";
type ChatImageWindowRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};
type ChatImageWindowGeometry = {
  autoSized: boolean;
  mode: ChatImageWindowMode;
  rect: ChatImageWindowRect;
  restoreRect: ChatImageWindowRect | null;
};
type ChatImageWindowResizeEdge = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
type ChatImageWindowInteraction =
  | {
      kind: "move";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startRect: ChatImageWindowRect;
    }
  | {
      edge: ChatImageWindowResizeEdge;
      kind: "resize";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startRect: ChatImageWindowRect;
    };
type ChatImageViewerState = {
  mode: ChatImageViewerMode;
  rotation: number;
  thumbnailsOpen: boolean;
  zoom: number;
};
type ChatImagePopoutPayload = {
  createdAt: number;
  currentIndex: number;
  images: ChatAttachment[];
};

const ChatFloatingImagePreviewContext = createContext<ChatFloatingImagePreviewContextValue | null>(null);
const chatImageZoomMin = 0.25;
const chatImageNaturalScaleMax = 5;
const chatImageZoomStep = 0.25;
const chatImageWindowResizeEdges: ChatImageWindowResizeEdge[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
const chatImageWindowMargin = 12;
const chatImageWindowNormalTopOffset = 18;
const chatImageWindowMinWidth = 520;
const chatImageWindowMinHeight = 360;
const chatImageWindowChromeHeight = 48 + 37;
const chatImageWindowThumbnailHeight = 77;
const chatImageWindowBodyPaddingX = 36;
const chatImageWindowBodyPaddingY = 36;
const chatImageWindowFallbackWidth = 900;
const chatImageWindowFallbackHeight = 760;
const chatImageFitOverflowGuardPx = 2;
const chatImagePanOverflowTolerance = 1;
const chatImageZoomNeutralTolerance = 0.001;
const chatImagePopoutPayloadPrefix = "orf:chat-image-popout:";
const chatImagePopoutPayloadMaxAgeMs = 12 * 60 * 60 * 1000;

export function ChatFloatingImagePreviewProvider({ children }: { children: ReactNode }) {
  const sessionIdRef = useRef(0);
  const [session, setSession] = useState<ChatFloatingImagePreviewSession | null>(null);
  const openImagePreview = useCallback((nextPreview: ChatAttachmentImagePreviewState) => {
    if (openChatImagePopoutWindow(nextPreview)) {
      setSession(null);
      return;
    }

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
  onToggleHostMaximize,
  preview,
  sessionId,
  standalone = false,
}: {
  onClose: () => void;
  onNavigateImage: (direction: -1 | 1) => void;
  onSelectImage: (index: number) => void;
  onToggleHostMaximize?: () => void;
  preview: ChatAttachmentImagePreviewState;
  sessionId: number;
  standalone?: boolean;
}) {
  const attachment = currentChatAttachmentPreviewImage(preview);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageDragRef = useRef<ChatImageViewerDrag | null>(null);
  const windowInteractionRef = useRef<ChatImageWindowInteraction | null>(null);
  const [draggingImage, setDraggingImage] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ height: number; width: number } | null>(null);
  const [fitSize, setFitSize] = useState<{ height: number; width: number } | null>(null);
  const [viewportSize, setViewportSize] = useState<{ height: number; width: number } | null>(null);
  const [viewerState, setViewerState] = useState<ChatImageViewerState>(() => defaultChatImageViewerState(preview.images.length > 1));
  const [windowGeometry, setWindowGeometry] = useState<ChatImageWindowGeometry>(() => (
    defaultChatImageWindowGeometry(chatAttachmentNaturalSize(attachment), preview.images.length > 1)
  ));
  const [windowInteraction, setWindowInteraction] = useState<"move" | "resize" | null>(null);
  const currentIndex = Math.min(Math.max(preview.currentIndex, 0), Math.max(preview.images.length - 1, 0));
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < preview.images.length - 1;
  const maximized = windowGeometry.mode === "maximized";
  const baseNaturalScale = chatImageBaseNaturalScale(fitSize, naturalSize);
  const viewerZoomMax = chatImageViewerZoomMax(baseNaturalScale);

  const updateViewerState = (update: Partial<ChatImageViewerState> | ((current: ChatImageViewerState) => ChatImageViewerState)) => {
    setViewerState((current) => typeof update === "function" ? update(current) : { ...current, ...update });
  };
  const setZoom = (nextZoom: number | ((current: number) => number)) => {
    setViewerState((current) => ({
      ...current,
      zoom: clampChatImageZoom(typeof nextZoom === "function" ? nextZoom(current.zoom) : nextZoom, viewerZoomMax),
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
  const toggleWindowMaximized = () => {
    setWindowGeometry((current) => {
      if (current.mode === "maximized") {
        return {
          autoSized: false,
          mode: "normal",
          rect: clampChatImageWindowRect(current.restoreRect ?? current.rect),
          restoreRect: null,
        };
      }

      return {
        autoSized: false,
        mode: "maximized",
        rect: chatImageWindowMaximizedRect(),
        restoreRect: current.rect,
      };
    });
  };
  const startWindowMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (standalone) return;
    if (event.button !== 0 || maximized || isChatImageWindowInteractiveTarget(event.target)) return;
    windowInteractionRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: windowGeometry.rect,
    };
    document.body.dataset.draggingFloating = "true";
    setWindowInteraction("move");
    event.preventDefault();
  };
  const startWindowResize = (edge: ChatImageWindowResizeEdge, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || maximized || isChatImageWindowMobileViewport()) return;
    windowInteractionRef.current = {
      edge,
      kind: "resize",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: windowGeometry.rect,
    };
    document.body.dataset.draggingFloating = "true";
    setWindowInteraction("resize");
    event.preventDefault();
    event.stopPropagation();
  };
  const handleWindowHeaderDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (isChatImageWindowInteractiveTarget(event.target)) return;
    if (standalone && onToggleHostMaximize) {
      onToggleHostMaximize();
      return;
    }
    toggleWindowMaximized();
  };
  const handleImageWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((value) => value + (event.deltaY > 0 ? -0.15 : 0.15));
  };
  const startImageDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (viewport.scrollWidth <= viewport.clientWidth && viewport.scrollHeight <= viewport.clientHeight) return;
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
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = windowInteractionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      event.preventDefault();

      const deltaX = event.clientX - interaction.startClientX;
      const deltaY = event.clientY - interaction.startClientY;
      setWindowGeometry((current) => ({
        ...current,
        autoSized: false,
        mode: "normal",
        rect: interaction.kind === "move"
          ? moveChatImageWindowRect(interaction.startRect, deltaX, deltaY)
          : resizeChatImageWindowRect(interaction.startRect, interaction.edge, deltaX, deltaY),
        restoreRect: null,
      }));
    };

    const stopInteraction = () => {
      if (!windowInteractionRef.current) return;
      windowInteractionRef.current = null;
      delete document.body.dataset.draggingFloating;
      setWindowInteraction(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopInteraction);
    window.addEventListener("pointercancel", stopInteraction);
    return () => {
      stopInteraction();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
      window.removeEventListener("pointercancel", stopInteraction);
    };
  }, []);

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
  }, [canGoNext, canGoPrevious, onClose, onNavigateImage, viewerState.zoom, viewerZoomMax]);

  useEffect(() => {
    setWindowGeometry(defaultChatImageWindowGeometry(chatAttachmentNaturalSize(attachment), preview.images.length > 1));
  }, [attachment, preview.images.length, sessionId]);

  useEffect(() => {
    const handleViewportResize = () => {
      setWindowGeometry((current) => current.mode === "maximized"
        ? { ...current, rect: chatImageWindowMaximizedRect() }
        : { ...current, rect: clampChatImageWindowRect(current.rect) });
    };

    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, []);

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
    if (!naturalSize) return;
    setWindowGeometry((current) => current.autoSized
      ? defaultChatImageWindowGeometry(naturalSize, preview.images.length > 1)
      : current);
  }, [naturalSize, preview.images.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !naturalSize) return undefined;

    const updateFitSize = () => {
      const bounds = chatImageViewportContentSize(viewport);
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const nextViewportSize = {
        height: Math.max(1, Math.round(bounds.height)),
        width: Math.max(1, Math.round(bounds.width)),
      };
      setViewportSize((current) => (
        current?.height === nextViewportSize.height && current.width === nextViewportSize.width ? current : nextViewportSize
      ));
      const next = renderedChatImageSize(naturalSize, viewerState.mode, viewerState.rotation, bounds);
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
  }, [naturalSize, viewerState.mode, viewerState.rotation, viewerState.thumbnailsOpen, windowGeometry.rect.height, windowGeometry.rect.width]);

  useEffect(() => {
    setViewerState((current) => {
      const nextZoom = clampChatImageZoom(current.zoom, viewerZoomMax);
      return nextZoom === current.zoom ? current : { ...current, zoom: nextZoom };
    });
  }, [viewerZoomMax]);

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
  const stageDimensions = imageSize
    ? {
        height: rotated ? imageSize.width : imageSize.height,
        width: rotated ? imageSize.height : imageSize.width,
      }
    : null;
  const canPanImage = canPanChatImageStage(stageDimensions, viewportSize, viewerState);
  const imageStyle: CSSProperties | undefined = imageSize
    ? {
        height: `${imageSize.height}px`,
        transform: `rotate(${viewerState.rotation}deg)`,
        width: `${imageSize.width}px`,
      }
    : undefined;
  const displayedZoomPercent = imageSize && naturalSize
    ? chatImageNaturalScalePercent(imageSize.width / naturalSize.width)
    : Math.round(viewerState.zoom * 100);
  const windowStyle = standalone
    ? undefined
    : {
        "--orf-chat-image-window-height": `${Math.round(windowGeometry.rect.height)}px`,
        "--orf-chat-image-window-left": `${Math.round(windowGeometry.rect.x)}px`,
        "--orf-chat-image-window-top": `${Math.round(windowGeometry.rect.y)}px`,
        "--orf-chat-image-window-width": `${Math.round(windowGeometry.rect.width)}px`,
      } as CSSProperties;

  const windowNode = (
    <div
      aria-label="聊天图片查看器"
      className="orf-chat-floating-image-preview"
      data-window-layout={standalone ? "popout" : "floating"}
      data-window-interaction={windowInteraction ?? "idle"}
      data-window-mode={windowGeometry.mode}
      role="dialog"
      style={windowStyle}
    >
      <header
        className="orf-chat-floating-image-preview-header"
        onDoubleClick={handleWindowHeaderDoubleClick}
        onPointerDown={startWindowMove}
      >
        <div className="orf-chat-floating-image-preview-tools">
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
            <button type="button" onClick={zoomIn} disabled={viewerState.zoom >= viewerZoomMax - chatImageZoomNeutralTolerance} title="放大图片" aria-label="放大图片">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" onClick={zoomOut} disabled={viewerState.zoom <= chatImageZoomMin} title="缩小图片" aria-label="缩小图片">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button type="button" className="orf-chat-image-viewer-text-button" onClick={toggleImageMode} title={viewerState.mode === "fit" ? "按原图大小显示" : "适应窗口显示"} aria-label={viewerState.mode === "fit" ? "按原图大小显示" : "适应窗口显示"}>
              {viewerState.mode === "fit" ? "1:1" : "适应"}
            </button>
            <button type="button" onClick={resetImageTransform} disabled={viewerState.zoom === 1 && viewerState.rotation === 0 && viewerState.mode === "fit"} title="重置图片" aria-label="重置图片">
              <span className="orf-chat-image-viewer-zoom">{displayedZoomPercent}%</span>
            </button>
            <button type="button" onClick={rotateImage} title="顺时针旋转" aria-label="顺时针旋转">
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
          <div className="orf-chat-floating-image-preview-tool-group">
            <ImageCopyButton fallbackMimeType={attachment.mimeType} sourceUrl={attachment.contentUrl} />
            <a
              aria-label="下载图片"
              download={attachment.fileName}
              href={attachment.contentUrl}
              title="下载图片"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              aria-label={maximized ? "还原图片窗口" : "放大图片窗口"}
              title={maximized ? "还原窗口" : "放大窗口"}
              type="button"
              onClick={() => {
                if (standalone && onToggleHostMaximize) {
                  onToggleHostMaximize();
                  return;
                }
                toggleWindowMaximized();
              }}
            >
              {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button aria-label="关闭图片窗口" title="关闭" type="button" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <div
        className="orf-chat-floating-image-preview-title"
        title={attachment.fileName}
        onDoubleClick={handleWindowHeaderDoubleClick}
        onPointerDown={startWindowMove}
      >
        <span>{attachment.fileName}</span>
        <small>{displayedZoomPercent}% · {currentIndex + 1} / {preview.images.length}</small>
      </div>
      <div
        className={[
          "orf-chat-floating-image-preview-body",
          draggingImage ? "orf-chat-floating-image-preview-body-dragging" : "",
        ].filter(Boolean).join(" ")}
        data-can-pan={canPanImage ? "true" : "false"}
        ref={viewportRef}
        onDoubleClick={resetImageTransform}
        onPointerCancel={stopImageDrag}
        onPointerDown={startImageDrag}
        onPointerLeave={stopImageDrag}
        onPointerMove={moveImageDrag}
        onPointerUp={stopImageDrag}
        onWheel={handleImageWheel}
      >
        {preview.images.length > 1 && (
          <div className="orf-chat-floating-image-preview-side-navigation" data-drag-ignore="true" onPointerDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="orf-chat-floating-image-preview-side-button"
              onClick={() => onNavigateImage(-1)}
              disabled={!canGoPrevious}
              title="上一张图片"
              aria-label="上一张图片"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="orf-chat-floating-image-preview-side-button"
              onClick={() => onNavigateImage(1)}
              disabled={!canGoNext}
              title="下一张图片"
              aria-label="下一张图片"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="orf-chat-floating-image-preview-stage" style={stageStyle}>
          <img
            alt={attachment.fileName}
            draggable={false}
            src={attachment.contentUrl}
            style={imageStyle}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                const nextNaturalSize = { height: image.naturalHeight, width: image.naturalWidth };
                setNaturalSize((current) => sameChatImageSize(current, nextNaturalSize) ? current : nextNaturalSize);
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
      {!standalone && chatImageWindowResizeEdges.map((edge) => (
        <div
          aria-hidden="true"
          className={`orf-chat-floating-image-preview-resize-handle orf-chat-floating-image-preview-resize-${edge}`}
          data-drag-ignore="true"
          key={edge}
          onPointerDown={(event) => startWindowResize(edge, event)}
        />
      ))}
    </div>
  );

  return standalone ? windowNode : createPortal(windowNode, document.body);
}

export function ChatImagePopoutPage() {
  const { popoutId } = useParams<{ popoutId: string }>();
  const [preview, setPreview] = useState<ChatAttachmentImagePreviewState | null>(() => readChatImagePopoutPreview(popoutId));

  useEffect(() => {
    const attachment = preview ? currentChatAttachmentPreviewImage(preview) : null;
    document.title = attachment?.fileName ? `${attachment.fileName} - ORF` : "ORF 图片窗口";
  }, [preview]);

  const closeWindow = () => {
    if (popoutId) removeChatImagePopoutPayload(popoutId);
    window.close();
  };
  const navigateImage = (direction: -1 | 1) => {
    setPreview((current) => current ? moveChatAttachmentPreviewImage(current, direction) : current);
  };
  const selectImage = (index: number) => {
    setPreview((current) => current ? selectChatAttachmentPreviewImage(current, index) : current);
  };
  const toggleHostMaximize = () => {
    void toggleMaximizeDesktopWindow().then((result) => {
      if (result.status !== "success") {
        toggleBrowserPopoutMaximize();
      }
    });
  };

  if (!preview) {
    return (
      <main className="orf-chat-image-popout-page">
        <section className="orf-chat-image-popout-empty" role="alert">
          <h1>图片窗口已失效</h1>
          <p>请回到聊天消息里重新打开图片。</p>
          <button type="button" onClick={() => window.close()}>关闭窗口</button>
        </section>
      </main>
    );
  }

  return (
    <main className="orf-chat-image-popout-page">
      <ChatFloatingImagePreviewWindow
        preview={preview}
        sessionId={0}
        standalone
        onClose={closeWindow}
        onNavigateImage={navigateImage}
        onSelectImage={selectImage}
        onToggleHostMaximize={toggleHostMaximize}
      />
    </main>
  );
}

function defaultChatImageViewerState(hasMultipleImages: boolean): ChatImageViewerState {
  return {
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

function renderedChatImageSize(
  naturalSize: { height: number; width: number },
  mode: ChatImageViewerMode,
  rotation: number,
  bounds: { height: number; width: number },
) {
  const effectiveNaturalSize = rotatedNaturalSize(naturalSize, rotation);
  const fitBounds = mode === "fit" ? guardedChatImageFitBounds(bounds) : bounds;
  const scale = mode === "fit"
    ? Math.min(fitBounds.width / effectiveNaturalSize.width, fitBounds.height / effectiveNaturalSize.height)
    : 1;
  const roundDimension = mode === "fit" ? Math.floor : Math.round;

  return {
    height: Math.max(1, roundDimension(naturalSize.height * scale)),
    width: Math.max(1, roundDimension(naturalSize.width * scale)),
  };
}

function guardedChatImageFitBounds(bounds: { height: number; width: number }) {
  return {
    height: Math.max(1, bounds.height - chatImageFitOverflowGuardPx),
    width: Math.max(1, bounds.width - chatImageFitOverflowGuardPx),
  };
}

function canPanChatImageStage(
  stageDimensions: { height: number; width: number } | null,
  viewportSize: { height: number; width: number } | null,
  viewerState: Pick<ChatImageViewerState, "mode" | "zoom">,
) {
  if (!stageDimensions || !viewportSize) return false;
  if (viewerState.mode === "fit" && viewerState.zoom <= 1 + chatImageZoomNeutralTolerance) return false;
  return (
    stageDimensions.width - viewportSize.width > chatImagePanOverflowTolerance ||
    stageDimensions.height - viewportSize.height > chatImagePanOverflowTolerance
  );
}

function sameChatImageSize(
  current: { height: number; width: number } | null,
  next: { height: number; width: number },
) {
  return Boolean(current && current.height === next.height && current.width === next.width);
}

function defaultChatImageWindowGeometry(
  naturalSize: { height: number; width: number } | null,
  hasThumbnails: boolean,
): ChatImageWindowGeometry {
  return {
    autoSized: true,
    mode: "normal",
    rect: defaultChatImageWindowRect(naturalSize, hasThumbnails),
    restoreRect: null,
  };
}

function defaultChatImageWindowRect(
  naturalSize: { height: number; width: number } | null,
  hasThumbnails: boolean,
): ChatImageWindowRect {
  const bounds = chatImageWindowNormalBounds();
  if (!naturalSize) {
    return centeredChatImageWindowRect(bounds, {
      height: Math.min(bounds.height, Math.max(chatImageWindowMinHeight, chatImageWindowFallbackHeight)),
      width: Math.min(bounds.width, Math.max(chatImageWindowMinWidth, chatImageWindowFallbackWidth)),
    });
  }

  const chromeHeight = chatImageWindowChromeHeight + chatImageWindowBodyPaddingY + (hasThumbnails ? chatImageWindowThumbnailHeight : 0);
  const originalSizeWindow = {
    height: Math.round(naturalSize.height + chromeHeight),
    width: Math.round(naturalSize.width + chatImageWindowBodyPaddingX),
  };
  const fitsOriginalSize = originalSizeWindow.width <= bounds.width && originalSizeWindow.height <= bounds.height;
  const targetSize = fitsOriginalSize
    ? {
        height: clamp(originalSizeWindow.height, Math.min(chatImageWindowMinHeight, bounds.height), bounds.height),
        width: clamp(originalSizeWindow.width, Math.min(chatImageWindowMinWidth, bounds.width), bounds.width),
      }
    : {
        height: bounds.height,
        width: bounds.width,
      };
  return centeredChatImageWindowRect(bounds, targetSize);
}

function centeredChatImageWindowRect(bounds: ChatImageWindowRect, size: { height: number; width: number }): ChatImageWindowRect {
  return clampChatImageWindowRect({
    height: size.height,
    width: size.width,
    x: bounds.x + Math.max(0, Math.round((bounds.width - size.width) / 2)),
    y: bounds.y + Math.max(0, Math.round((bounds.height - size.height) / 2)),
  });
}

function chatImageWindowNormalBounds(): ChatImageWindowRect {
  if (typeof window === "undefined") {
    return { height: chatImageWindowFallbackHeight, width: chatImageWindowFallbackWidth, x: chatImageWindowMargin, y: chatImageWindowMargin };
  }
  const topbarHeight = readChatImageWindowCssPx("--orf-topbar-height");
  const y = Math.max(chatImageWindowMargin, topbarHeight + chatImageWindowNormalTopOffset);
  return {
    height: Math.max(chatImageWindowMinHeight, window.innerHeight - y - chatImageWindowMargin),
    width: Math.max(chatImageWindowMinWidth, window.innerWidth - chatImageWindowMargin * 2),
    x: chatImageWindowMargin,
    y,
  };
}

function chatImageWindowMaximizedRect(): ChatImageWindowRect {
  if (typeof window === "undefined") {
    return { height: chatImageWindowFallbackHeight, width: chatImageWindowFallbackWidth, x: chatImageWindowMargin, y: chatImageWindowMargin };
  }
  return {
    height: Math.max(chatImageWindowMinHeight, window.innerHeight - chatImageWindowMargin * 2),
    width: Math.max(chatImageWindowMinWidth, window.innerWidth - chatImageWindowMargin * 2),
    x: chatImageWindowMargin,
    y: chatImageWindowMargin,
  };
}

function moveChatImageWindowRect(startRect: ChatImageWindowRect, deltaX: number, deltaY: number): ChatImageWindowRect {
  return clampChatImageWindowRect({
    ...startRect,
    x: startRect.x + deltaX,
    y: startRect.y + deltaY,
  });
}

function resizeChatImageWindowRect(
  startRect: ChatImageWindowRect,
  edge: ChatImageWindowResizeEdge,
  deltaX: number,
  deltaY: number,
): ChatImageWindowRect {
  const bounds = chatImageWindowMaximizedRect();
  const startRight = startRect.x + startRect.width;
  const startBottom = startRect.y + startRect.height;
  let nextX = startRect.x;
  let nextY = startRect.y;
  let nextWidth = startRect.width;
  let nextHeight = startRect.height;

  if (edge.includes("e")) {
    nextWidth = clamp(startRect.width + deltaX, chatImageWindowMinWidth, bounds.x + bounds.width - startRect.x);
  }
  if (edge.includes("s")) {
    nextHeight = clamp(startRect.height + deltaY, chatImageWindowMinHeight, bounds.y + bounds.height - startRect.y);
  }
  if (edge.includes("w")) {
    nextX = clamp(startRect.x + deltaX, bounds.x, startRight - chatImageWindowMinWidth);
    nextWidth = startRight - nextX;
  }
  if (edge.includes("n")) {
    nextY = clamp(startRect.y + deltaY, bounds.y, startBottom - chatImageWindowMinHeight);
    nextHeight = startBottom - nextY;
  }

  return clampChatImageWindowRect({
    height: nextHeight,
    width: nextWidth,
    x: nextX,
    y: nextY,
  });
}

function clampChatImageWindowRect(rect: ChatImageWindowRect): ChatImageWindowRect {
  const bounds = chatImageWindowMaximizedRect();
  const width = clamp(rect.width, Math.min(chatImageWindowMinWidth, bounds.width), bounds.width);
  const height = clamp(rect.height, Math.min(chatImageWindowMinHeight, bounds.height), bounds.height);
  return {
    height,
    width,
    x: clamp(rect.x, bounds.x, bounds.x + bounds.width - width),
    y: clamp(rect.y, bounds.y, bounds.y + bounds.height - height),
  };
}

function readChatImageWindowCssPx(name: string) {
  if (typeof window === "undefined") return 0;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function chatImageViewportContentSize(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const paddingX = cssPx(style.paddingLeft) + cssPx(style.paddingRight);
  const paddingY = cssPx(style.paddingTop) + cssPx(style.paddingBottom);
  return {
    height: Math.max(1, element.clientHeight - paddingY),
    width: Math.max(1, element.clientWidth - paddingX),
  };
}

function cssPx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isChatImageWindowInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("button, input, textarea, select, a, [data-drag-ignore='true']"));
}

function isChatImageWindowMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(chatMobileViewportQuery).matches;
}

function imageDimension(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function chatImageBaseNaturalScale(
  fitSize: { height: number; width: number } | null,
  naturalSize: { height: number; width: number } | null,
) {
  if (!fitSize || !naturalSize || naturalSize.width <= 0) return null;
  return fitSize.width / naturalSize.width;
}

function chatImageViewerZoomMax(baseNaturalScale: number | null) {
  if (!baseNaturalScale || !Number.isFinite(baseNaturalScale) || baseNaturalScale <= 0) {
    return chatImageNaturalScaleMax;
  }
  return Math.max(1, chatImageNaturalScaleMax / baseNaturalScale);
}

function chatImageNaturalScalePercent(value: number) {
  return Math.max(1, Math.round(value * 100));
}

function clampChatImageZoom(value: number, maxZoom: number) {
  const safeMaxZoom = Number.isFinite(maxZoom) && maxZoom > 0 ? maxZoom : chatImageNaturalScaleMax;
  return Math.min(safeMaxZoom, Math.max(chatImageZoomMin, Math.round(value * 100) / 100));
}

function isChatImageViewerShortcutEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function openChatImagePopoutWindow(preview: ChatAttachmentImagePreviewState) {
  if (typeof window === "undefined" || isChatImageWindowMobileViewport()) return false;
  const payload = chatImagePopoutPayload(preview);
  if (!payload) return false;
  const popoutId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    cleanupStaleChatImagePopoutPayloads();
    window.localStorage.setItem(chatImagePopoutPayloadKey(popoutId), JSON.stringify(payload));
    const popout = window.open(
      `/chat/image-popout/${encodeURIComponent(popoutId)}`,
      chatImagePopoutWindowName(popoutId),
      chatImagePopoutWindowFeatures(payload),
    );
    if (!popout) {
      removeChatImagePopoutPayload(popoutId);
      return false;
    }
    popout.focus();
    return true;
  } catch {
    removeChatImagePopoutPayload(popoutId);
    return false;
  }
}

function chatImagePopoutPayload(preview: ChatAttachmentImagePreviewState): ChatImagePopoutPayload | null {
  const images = preview.images.map(normalizeChatImagePopoutAttachment).filter((image): image is ChatAttachment => Boolean(image));
  if (images.length === 0) return null;
  return {
    createdAt: Date.now(),
    currentIndex: clampPreviewIndex(preview.currentIndex, images.length - 1),
    images,
  };
}

function readChatImagePopoutPreview(popoutId?: string) {
  if (!popoutId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(chatImagePopoutPayloadKey(popoutId));
    if (!raw) return null;
    const payload = normalizeChatImagePopoutPayload(JSON.parse(raw));
    if (!payload || Date.now() - payload.createdAt > chatImagePopoutPayloadMaxAgeMs) {
      removeChatImagePopoutPayload(popoutId);
      return null;
    }
    return {
      kind: "image" as const,
      currentIndex: payload.currentIndex,
      images: payload.images,
    };
  } catch {
    return null;
  }
}

function normalizeChatImagePopoutPayload(value: unknown): ChatImagePopoutPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<ChatImagePopoutPayload>;
  const images = Array.isArray(payload.images)
    ? payload.images.map(normalizeChatImagePopoutAttachment).filter((image): image is ChatAttachment => Boolean(image))
    : [];
  if (images.length === 0) return null;
  const createdAt = typeof payload.createdAt === "number" && Number.isFinite(payload.createdAt)
    ? payload.createdAt
    : 0;
  return {
    createdAt,
    currentIndex: clampPreviewIndex(typeof payload.currentIndex === "number" ? payload.currentIndex : 0, images.length - 1),
    images,
  };
}

function normalizeChatImagePopoutAttachment(value: unknown): ChatAttachment | null {
  if (!value || typeof value !== "object") return null;
  const attachment = value as Partial<ChatAttachment>;
  const id = safeChatImagePopoutText(attachment.id);
  const fileName = safeChatImagePopoutText(attachment.fileName);
  const mimeType = safeChatImagePopoutText(attachment.mimeType);
  const contentUrl = safeChatImagePopoutText(attachment.contentUrl);
  if (!id || !fileName || !mimeType.startsWith("image/") || !contentUrl) return null;
  return {
    id,
    fileName,
    mimeType,
    contentUrl,
    createdAt: safeChatImagePopoutText(attachment.createdAt),
    fileSize: safeChatImagePopoutNumber(attachment.fileSize) ?? 0,
    height: safeChatImagePopoutNumber(attachment.height),
    width: safeChatImagePopoutNumber(attachment.width),
  };
}

function safeChatImagePopoutText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeChatImagePopoutNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function chatImagePopoutPayloadKey(popoutId: string) {
  return `${chatImagePopoutPayloadPrefix}${popoutId}`;
}

function removeChatImagePopoutPayload(popoutId: string) {
  try {
    window.localStorage.removeItem(chatImagePopoutPayloadKey(popoutId));
  } catch {
    // Ignore best-effort cleanup failures.
  }
}

function cleanupStaleChatImagePopoutPayloads() {
  try {
    const now = Date.now();
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(chatImagePopoutPayloadPrefix)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const payload = normalizeChatImagePopoutPayload(JSON.parse(raw));
      if (!payload || now - payload.createdAt > chatImagePopoutPayloadMaxAgeMs) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Stale popout payloads are temporary display state; cleanup is best-effort.
  }
}

function chatImagePopoutWindowFeatures(payload: ChatImagePopoutPayload) {
  const image = payload.images[clampPreviewIndex(payload.currentIndex, payload.images.length - 1)];
  const hasThumbnails = payload.images.length > 1;
  const width = Math.max(
    chatImageWindowMinWidth,
    Math.round((image?.width ?? chatImageWindowFallbackWidth) + chatImageWindowBodyPaddingX),
  );
  const height = Math.max(
    chatImageWindowMinHeight,
    Math.round((image?.height ?? chatImageWindowFallbackHeight) + chatImageWindowChromeHeight + chatImageWindowBodyPaddingY + (hasThumbnails ? chatImageWindowThumbnailHeight : 0)),
  );
  return [
    "popup=yes",
    "resizable=yes",
    "scrollbars=no",
    `width=${width}`,
    `height=${height}`,
  ].join(",");
}

function chatImagePopoutWindowName(popoutId: string) {
  return `orf-chat-image-popout-${popoutId}`;
}

function toggleBrowserPopoutMaximize() {
  try {
    const width = window.screen.availWidth || window.outerWidth;
    const height = window.screen.availHeight || window.outerHeight;
    window.moveTo(0, 0);
    window.resizeTo(width, height);
  } catch {
    // Browser popups may reject scripted maximize; native chrome remains available.
  }
}

function clampPreviewIndex(index: number, lastIndex: number) {
  if (lastIndex <= 0) return 0;
  return Math.min(Math.max(Math.floor(index), 0), lastIndex);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
