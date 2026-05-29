import { X } from "lucide-react";
import { useEffect } from "react";

export type ImagePreview = {
  alt: string;
  label: string;
  src: string;
};

export function ImagePreviewDialog({ onClose, preview }: { onClose: () => void; preview: ImagePreview }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="orf-image-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="orf-image-preview-dialog"
        role="dialog"
        aria-label={preview.label}
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="orf-image-preview-close" aria-label="关闭图片预览" title="关闭" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
        <img className="orf-image-preview" src={preview.src} alt={preview.alt} />
      </div>
    </div>
  );
}
