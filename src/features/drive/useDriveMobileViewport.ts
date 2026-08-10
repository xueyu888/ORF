import { useEffect, useState } from "react";

export const driveMobileViewportQuery = "(max-width: 900px)";

function isDriveMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(driveMobileViewportQuery).matches;
}

export function useDriveMobileViewport() {
  const [mobile, setMobile] = useState(isDriveMobileViewport);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const query = window.matchMedia(driveMobileViewportQuery);
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
