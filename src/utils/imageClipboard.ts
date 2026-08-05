export async function copyImageToClipboard({
  fallbackMimeType,
  sourceUrl,
}: {
  fallbackMimeType?: string | null;
  sourceUrl: string;
}) {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image copy is not supported");
  }

  const response = await fetch(sourceUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Image content request failed");
  }

  const imageBlob = await response.blob();
  const clipboardBlob = await clipboardWritableImageBlob(imageBlob, fallbackMimeType);
  const mimeType = clipboardBlob.type || "image/png";
  await navigator.clipboard.write([new ClipboardItem({ [mimeType]: clipboardBlob })]);
}

async function clipboardWritableImageBlob(blob: Blob, fallbackMimeType?: string | null) {
  const mimeType = blob.type || fallbackMimeType || "image/png";
  if (isClipboardImageMimeTypeSupported(mimeType)) {
    return blob.type ? blob : blob.slice(0, blob.size, mimeType);
  }
  return convertImageBlobToPng(blob);
}

function isClipboardImageMimeTypeSupported(mimeType: string) {
  if (!mimeType.startsWith("image/")) return false;
  const clipboardItemWithSupports = ClipboardItem as unknown as { supports?: (type: string) => boolean };
  if (typeof clipboardItemWithSupports.supports === "function") {
    return clipboardItemWithSupports.supports(mimeType);
  }
  return mimeType === "image/png";
}

async function convertImageBlobToPng(blob: Blob) {
  const image = new Image();
  const objectUrl = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image decode failed"));
      image.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context || canvas.width <= 0 || canvas.height <= 0) {
      throw new Error("Canvas image copy failed");
    }
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error("Canvas image copy failed"));
        }
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
