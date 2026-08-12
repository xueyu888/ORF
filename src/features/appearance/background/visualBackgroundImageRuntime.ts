type DecodedBackground = {
  image: HTMLImageElement;
  ready: Promise<HTMLImageElement>;
};

const decodedBackgroundLimit = 4;
const decodedBackgrounds = new Map<string, DecodedBackground>();

function loadDecodedBackground(imageUrl: string) {
  const image = new window.Image();
  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    let decodeStarted = false;
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      callback();
    };
    const decode = () => {
      if (decodeStarted || settled) return;
      decodeStarted = true;
      void image.decode()
        .then(() => finish(() => resolve(image)))
        .catch(() => {
          if (image.complete && image.naturalWidth > 0) {
            finish(() => resolve(image));
          } else {
            finish(() => reject(new Error("Visual background image failed to decode")));
          }
        });
    };
    image.decoding = "async";
    image.onload = decode;
    image.onerror = () => finish(() => reject(new Error("Visual background image failed to load")));
    image.src = imageUrl;
    if (image.complete && image.naturalWidth > 0) decode();
  });
  return { image, ready };
}

function trimDecodedBackgrounds() {
  while (decodedBackgrounds.size > decodedBackgroundLimit) {
    const oldest = decodedBackgrounds.keys().next().value as string | undefined;
    if (!oldest) return;
    decodedBackgrounds.delete(oldest);
  }
}

export function ensureVisualBackgroundDecoded(imageUrl: string) {
  const cached = decodedBackgrounds.get(imageUrl);
  if (cached) {
    decodedBackgrounds.delete(imageUrl);
    decodedBackgrounds.set(imageUrl, cached);
    return cached.ready;
  }

  const decoded = loadDecodedBackground(imageUrl);
  const entry: DecodedBackground = {
    image: decoded.image,
    ready: decoded.ready,
  };
  entry.ready = entry.ready.catch((error) => {
    if (decodedBackgrounds.get(imageUrl) === entry) decodedBackgrounds.delete(imageUrl);
    throw error;
  });
  decodedBackgrounds.set(imageUrl, entry);
  trimDecodedBackgrounds();
  return entry.ready;
}
