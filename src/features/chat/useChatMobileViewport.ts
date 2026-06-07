import { useEffect, useState } from "react";

export const chatMobileViewportQuery = "(max-width: 768px)";

function isChatMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(chatMobileViewportQuery).matches;
}

export function useChatMobileViewport() {
  const [mobile, setMobile] = useState(isChatMobileViewport);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const query = window.matchMedia(chatMobileViewportQuery);
    const sync = () => setMobile(query.matches);
    sync();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }

    query.addListener(sync);
    return () => query.removeListener(sync);
  }, []);

  return mobile;
}
