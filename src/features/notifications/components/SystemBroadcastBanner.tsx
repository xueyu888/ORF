import { Megaphone, X } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { SystemBroadcast } from "../../../types/realtime";

const BROADCAST_VISIBLE_MS = 18_000;

export function SystemBroadcastBanner({
  broadcasts,
  onDismiss,
}: {
  broadcasts: SystemBroadcast[];
  onDismiss: (id: string) => void;
}) {
  const navigate = useNavigate();
  const broadcast = broadcasts[0];

  useEffect(() => {
    if (!broadcast) {
      return undefined;
    }

    const timer = window.setTimeout(() => onDismiss(broadcast.id), BROADCAST_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [broadcast, onDismiss]);

  if (!broadcast) {
    return null;
  }

  const broadcastText = `${broadcast.title} · ${broadcast.body}`;

  return (
    <section className="orf-system-broadcast" data-tone={broadcast.tone} aria-live="polite" aria-label="系统广播">
      <Megaphone className="orf-system-broadcast-icon" aria-hidden="true" />
      <button
        type="button"
        className="orf-system-broadcast-track"
        onClick={() => {
          onDismiss(broadcast.id);
          navigate(broadcast.targetHref);
        }}
      >
        <span className="orf-system-broadcast-marquee">
          <span>{broadcastText}</span>
          <span aria-hidden="true">{broadcastText}</span>
        </span>
      </button>
      <button
        type="button"
        className="orf-system-broadcast-close"
        aria-label="关闭广播"
        onClick={() => onDismiss(broadcast.id)}
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
