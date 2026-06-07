import { ExternalLink, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { orfClientCurrentVersion } from "./clientUpdateConfig";
import { getClientRelease } from "./clientUpdateApi";
import { compareReleaseVersions, type ClientReleaseInfo } from "./clientUpdateModel";
import { detectClientUpdateRuntimeInfo, openClientUpdateUrl } from "./clientUpdateRuntime";

const releaseNotesSeenStoragePrefix = "orf-client-release-notes-seen:";

type ReleaseNotesState =
  | { status: "hidden" }
  | { status: "loading" }
  | { release: ClientReleaseInfo; status: "ready" };

export function ClientReleaseNotesDialog() {
  const [notesState, setNotesState] = useState<ReleaseNotesState>({ status: "loading" });
  const [openingReleasePage, setOpeningReleasePage] = useState(false);

  useEffect(() => {
    if (notesState.status !== "loading") return undefined;

    const controller = new AbortController();
    void loadCurrentReleaseNotes(controller.signal)
      .then((release) => {
        if (controller.signal.aborted) return;
        setNotesState(release ? { status: "ready", release } : { status: "hidden" });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setNotesState({ status: "hidden" });
        }
      });

    return () => controller.abort();
  }, [notesState.status]);

  const release = notesState.status === "ready" ? notesState.release : null;
  const noteLines = useMemo(() => formatReleaseNotes(release?.body), [release?.body]);

  if (!release) return null;

  const close = () => {
    rememberReleaseNotesSeen(release.version);
    setNotesState({ status: "hidden" });
  };

  const openReleasePage = async () => {
    setOpeningReleasePage(true);
    try {
      await openClientUpdateUrl(release.htmlUrl);
    } finally {
      setOpeningReleasePage(false);
    }
  };

  return (
    <div className="orf-client-release-notes-backdrop" role="presentation" onMouseDown={close}>
      <section
        aria-labelledby="orf-client-release-notes-title"
        aria-modal="true"
        className="orf-client-release-notes-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="orf-client-release-notes-header">
          <div className="orf-client-release-notes-icon" aria-hidden="true">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="orf-client-release-notes-kicker">客户端已更新</p>
            <h2 id="orf-client-release-notes-title">ORF {release.version} 更新说明</h2>
          </div>
          <button className="orf-client-release-notes-close" type="button" aria-label="关闭更新说明" onClick={close}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="orf-client-release-notes-body">
          {noteLines.map((line, index) => (
            <p key={`${index}-${line.text}`} data-release-note-line={line.kind}>
              {line.text}
            </p>
          ))}
        </div>

        <footer className="orf-client-release-notes-actions">
          <button className="orf-client-release-notes-secondary" type="button" disabled={openingReleasePage} onClick={() => void openReleasePage()}>
            <ExternalLink className="h-3.5 w-3.5" />
            查看发布页
          </button>
          <button className="orf-client-release-notes-primary" type="button" onClick={close}>
            知道了
          </button>
        </footer>
      </section>
    </div>
  );
}

async function loadCurrentReleaseNotes(signal: AbortSignal) {
  const runtime = await detectClientUpdateRuntimeInfo(orfClientCurrentVersion);
  if (runtime.platform !== "android" && runtime.platform !== "desktop-windows") {
    return null;
  }
  if (runtime.versionSource !== "native") {
    return null;
  }
  if (hasSeenReleaseNotes(runtime.currentVersion)) {
    return null;
  }
  const release = await getClientRelease(runtime.currentVersion, signal);
  return compareReleaseVersions(release.version, runtime.currentVersion) === 0 ? release : null;
}

function hasSeenReleaseNotes(version: string) {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(`${releaseNotesSeenStoragePrefix}${version}`) !== null;
}

function rememberReleaseNotesSeen(version: string) {
  window.localStorage.setItem(`${releaseNotesSeenStoragePrefix}${version}`, new Date().toISOString());
}

function formatReleaseNotes(body?: string | null) {
  const fallback = "本次客户端已更新，详细内容可查看 GitHub 发布页。";
  return (body?.trim() || fallback)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("- ")) {
        return { kind: "bullet", text: line.slice(2).trim() };
      }
      return { kind: "text", text: line };
    });
}
