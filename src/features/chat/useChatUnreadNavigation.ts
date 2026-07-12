import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOrf } from "../../state/OrfProvider";

export function useChatUnreadNavigation(onNavigateIntent?: (path: string) => void) {
  const navigate = useNavigate();
  const { refreshChatUnreadSummary } = useOrf();

  return useCallback(async () => {
    let targetPath = "/chat";
    try {
      targetPath = (await refreshChatUnreadSummary()).nextTarget?.targetPath ?? targetPath;
    } catch {
      // The chat page remains the safe fallback when summary refresh is unavailable.
    }
    onNavigateIntent?.(targetPath);
    navigate(targetPath);
  }, [navigate, onNavigateIntent, refreshChatUnreadSummary]);
}
