import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { VisualBackgroundCrop } from "../domain/settings/visualBackgrounds";
import { ensureVisualBackgroundDecoded } from "../features/appearance/background/visualBackgroundImageRuntime";

type VisualBackgroundSlotProps = {
  crop: VisualBackgroundCrop;
  frameClassName: string;
  imageClassName?: string;
  imageUrl: string | null;
  clearWhenEmpty?: boolean;
  loading?: "eager" | "lazy";
  onImageError?: () => void;
};

export function VisualBackgroundSlot({
  crop,
  frameClassName,
  imageClassName,
  imageUrl,
  clearWhenEmpty = true,
  loading = "eager",
  onImageError,
}: VisualBackgroundSlotProps) {
  const loadGenerationRef = useRef(0);
  const [displayed, setDisplayed] = useState<{ crop: VisualBackgroundCrop; url: string } | null>(() => (
    imageUrl ? { crop, url: imageUrl } : null
  ));
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    if (!imageUrl) {
      if (clearWhenEmpty) setDisplayed(null);
      setFailedUrl(null);
      return undefined;
    }
    if (failedUrl === imageUrl) return undefined;
    if (displayed?.url === imageUrl) return undefined;

    let cancelled = false;
    void ensureVisualBackgroundDecoded(imageUrl)
      .then(() => {
        if (!cancelled && generation === loadGenerationRef.current) {
          setFailedUrl(null);
          setDisplayed({ crop, url: imageUrl });
        }
      })
      .catch(() => {
        if (!cancelled && generation === loadGenerationRef.current) {
          setFailedUrl(imageUrl);
          setDisplayed((current) => current?.url === imageUrl ? null : current);
          onImageError?.();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clearWhenEmpty, crop, displayed?.url, failedUrl, imageUrl, onImageError]);

  useEffect(() => {
    if (failedUrl && failedUrl !== imageUrl) setFailedUrl(null);
  }, [failedUrl, imageUrl]);

  if (!displayed) return null;
  const displayedCrop = displayed.url === imageUrl ? crop : displayed.crop;
  const handleRenderedImageError = () => {
    const failedImageUrl = displayed.url;
    setFailedUrl(failedImageUrl);
    setDisplayed((current) => current?.url === failedImageUrl ? null : current);
    onImageError?.();
  };

  return (
    <span className={["orf-visual-bg-slot", frameClassName].filter(Boolean).join(" ")} aria-hidden="true">
      <img
        className={["orf-visual-bg-slot-image", imageClassName].filter(Boolean).join(" ")}
        src={displayed.url}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading={loading}
        decoding="async"
        onError={handleRenderedImageError}
        style={visualBackgroundSlotStyle(displayedCrop)}
      />
    </span>
  );
}

function visualBackgroundSlotStyle(crop: VisualBackgroundCrop) {
  return {
    "--orf-visual-bg-center-x": `${crop.centerX * 100}%`,
    "--orf-visual-bg-center-y": `${crop.centerY * 100}%`,
    "--orf-visual-bg-zoom": crop.zoom,
  } as CSSProperties;
}
