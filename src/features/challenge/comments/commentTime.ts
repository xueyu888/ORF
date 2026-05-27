export type CommentTimeDisplay = {
  dateTime?: string;
  label: string;
  title?: string;
};

export function commentTimeDisplay(value: string, referenceNow = Date.now()): CommentTimeDisplay {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: value };
  }

  const absoluteTime = formatLocalDateTimeMinute(date);
  const diffMinutes = Math.max(0, Math.floor((referenceNow - date.getTime()) / 60000));

  if (diffMinutes < 1) {
    return { dateTime: date.toISOString(), label: "刚刚", title: absoluteTime };
  }

  if (diffMinutes < 60) {
    return { dateTime: date.toISOString(), label: `${diffMinutes} 分钟前`, title: absoluteTime };
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return { dateTime: date.toISOString(), label: `${diffHours} 小时前`, title: absoluteTime };
  }

  return { dateTime: date.toISOString(), label: absoluteTime, title: absoluteTime };
}

function formatLocalDateTimeMinute(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
