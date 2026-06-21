import { Clock3, NotebookPen, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WorkLogReminderState } from "../../types/orf";

export function GlobalWorkLogReminderModal({
  reminder,
  onSnooze,
}: {
  reminder: WorkLogReminderState | null;
  onSnooze: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!reminder || reminder.status !== "active" || !reminder.shouldRemindNow || reminder.missingDates.length === 0) {
    return null;
  }

  const firstMissingDate = reminder.missingDates[0] ?? reminder.windowEndDate;
  const snooze = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSnooze();
    } finally {
      setBusy(false);
    }
  };
  const openWorkLogs = async () => {
    await snooze();
    navigate(`/work-logs?date=${encodeURIComponent(firstMissingDate)}&view=today`);
  };

  return (
    <div className="work-log-reminder-modal-backdrop" role="presentation">
      <section
        aria-label="工作日志欠账强提醒"
        aria-modal="true"
        className="work-log-reminder-modal"
        role="dialog"
      >
        <button
          type="button"
          className="work-log-reminder-modal-close"
          aria-label="10 分钟后提醒"
          disabled={busy}
          onClick={() => void snooze()}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="work-log-reminder-modal-icon">
          <NotebookPen className="h-6 w-6" />
        </div>
        <div className="work-log-reminder-modal-content">
          <h2>工作日志未补全</h2>
          <p>
            你有 {reminder.missingDates.length} 天工作日志未补全：
          </p>
          <div className="work-log-reminder-date-list" aria-label="缺失日期">
            {reminder.missingDates.map((date) => (
              <button
                type="button"
                key={date}
                onClick={() => {
                  void snooze().then(() => navigate(`/work-logs?date=${encodeURIComponent(date)}&view=today`));
                }}
              >
                {formatReminderDate(date)}
              </button>
            ))}
          </div>
        </div>
        <div className="work-log-reminder-modal-actions">
          <button
            type="button"
            className="work-log-reminder-secondary"
            disabled={busy}
            onClick={() => void snooze()}
          >
            <Clock3 className="h-4 w-4" />
            10 分钟后提醒
          </button>
          <button
            type="button"
            className="work-log-reminder-primary"
            disabled={busy}
            onClick={() => void openWorkLogs()}
          >
            <NotebookPen className="h-4 w-4" />
            去补日志
          </button>
        </div>
      </section>
    </div>
  );
}

function formatReminderDate(date: string) {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (!Number.isFinite(month) || !Number.isFinite(day)) return date;
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}
