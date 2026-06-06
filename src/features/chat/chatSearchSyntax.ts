export type ChatSearchAttachmentFilter = "file" | "image";

export type ParsedChatSearchQuery = {
  text: string;
  authorQuery: string | null;
  channelQuery: string | null;
  attachment: ChatSearchAttachmentFilter | null;
  afterDate: string | null;
  beforeDate: string | null;
};

export const chatSearchInputPlaceholder = "搜索消息，支持 from:薛雨 in:频道 has:file";

const searchTokenPattern = /(^|\s)(from|in|has|after|before):(?:"([^"]*)"|'([^']*)'|(\S+))/gi;

export function parseChatSearchQuery(query: string): ParsedChatSearchQuery {
  const parsed: ParsedChatSearchQuery = {
    text: "",
    authorQuery: null,
    channelQuery: null,
    attachment: null,
    afterDate: null,
    beforeDate: null,
  };

  const text = query.replace(searchTokenPattern, (match, prefix: string, key: string, doubleQuoted?: string, singleQuoted?: string, bare?: string) => {
    const value = normalizeTokenValue(doubleQuoted ?? singleQuoted ?? bare ?? "");
    if (!value) return match;

    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "from") {
      parsed.authorQuery = value;
      return prefix || " ";
    }
    if (normalizedKey === "in") {
      parsed.channelQuery = value;
      return prefix || " ";
    }
    if (normalizedKey === "has") {
      const attachment = normalizeAttachmentFilter(value);
      if (!attachment) return match;
      parsed.attachment = attachment;
      return prefix || " ";
    }
    if (normalizedKey === "after") {
      const date = normalizeIsoDate(value);
      if (!date) return match;
      parsed.afterDate = date;
      return prefix || " ";
    }
    if (normalizedKey === "before") {
      const date = normalizeIsoDate(value);
      if (!date) return match;
      parsed.beforeDate = date;
      return prefix || " ";
    }
    return match;
  });

  parsed.text = text.replace(/\s+/g, " ").trim();
  return parsed;
}

export function hasExecutableChatSearch(query: ParsedChatSearchQuery) {
  return (
    query.text.length >= 2 ||
    Boolean(query.authorQuery) ||
    Boolean(query.channelQuery) ||
    Boolean(query.attachment) ||
    Boolean(query.afterDate) ||
    Boolean(query.beforeDate)
  );
}

export function addDaysToIsoDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function normalizeTokenValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeAttachmentFilter(value: string): ChatSearchAttachmentFilter | null {
  const normalized = value.toLowerCase();
  if (["file", "files", "attachment", "attachments"].includes(normalized)) return "file";
  if (["image", "images", "img", "picture", "pictures"].includes(normalized)) return "image";
  return null;
}

function normalizeIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}
