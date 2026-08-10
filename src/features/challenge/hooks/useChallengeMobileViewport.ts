import { useEffect, useState } from "react";

export const challengeMobileViewportQuery = "(max-width: 768px)";

function isChallengeMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(challengeMobileViewportQuery).matches;
}

export function useChallengeMobileViewport() {
  const [mobile, setMobile] = useState(isChallengeMobileViewport);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const query = window.matchMedia(challengeMobileViewportQuery);
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
