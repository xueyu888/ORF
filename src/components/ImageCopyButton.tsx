import { Check, Copy } from "lucide-react";
import { type ButtonHTMLAttributes, useEffect, useRef, useState } from "react";
import { copyImageToClipboard } from "../utils/imageClipboard";

type ImageCopyStatus = "idle" | "copying" | "copied" | "failed";

export function ImageCopyButton({
  fallbackMimeType,
  onBeforeCopy,
  showLabel = false,
  sourceUrl,
  ...buttonProps
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children" | "onClick" | "title" | "type"> & {
  fallbackMimeType?: string | null;
  onBeforeCopy?: () => void;
  showLabel?: boolean;
  sourceUrl: string;
}) {
  const resetTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<ImageCopyStatus>("idle");
  const title = imageCopyButtonTitle(status);

  const handleCopy = async () => {
    if (status === "copying") return;
    onBeforeCopy?.();
    setStatus("copying");
    try {
      await copyImageToClipboard({ fallbackMimeType, sourceUrl });
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => setStatus("idle"), 1800);
  };

  useEffect(() => {
    setStatus("idle");
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, [sourceUrl]);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
  }, []);

  return (
    <button
      {...buttonProps}
      type="button"
      disabled={buttonProps.disabled || status === "copying"}
      title={title}
      aria-label={title}
      onClick={() => void handleCopy()}
    >
      {status === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {showLabel ? <span>{status === "copied" ? "已复制" : "复制图片"}</span> : null}
    </button>
  );
}

function imageCopyButtonTitle(status: ImageCopyStatus) {
  if (status === "copying") return "正在复制图片";
  if (status === "copied") return "图片已复制";
  if (status === "failed") return "复制失败";
  return "复制图片";
}
