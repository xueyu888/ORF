export type ChatReactionOption = {
  aliases?: string[];
  emojiName: string;
  keywords: string[];
  label: string;
  symbol: string;
};

function defineChatReactionOption(
  emojiName: string,
  symbol: string,
  label: string,
  keywords: string[],
  aliases: string[] = [],
): ChatReactionOption {
  return { aliases, emojiName, keywords, label, symbol };
}

export const chatReactionOptions: ChatReactionOption[] = [
  defineChatReactionOption("grinning", "😀", "笑脸", ["smile", "笑脸", "开心"], ["😀"]),
  defineChatReactionOption("smiley", "😃", "开心", ["smiley", "笑脸", "开心"], ["😃"]),
  defineChatReactionOption("smile", "😄", "微笑", ["smile", "笑", "开心"], ["😄"]),
  defineChatReactionOption("laughing", "😆", "大笑", ["laugh", "笑", "哈哈"], ["satisfied", "😆"]),
  defineChatReactionOption("rolling_on_the_floor_laughing", "🤣", "笑翻", ["rofl", "笑翻", "爆笑"], ["rofl", "🤣"]),
  defineChatReactionOption("thumbsup", "👍", "点赞", ["like", "agree", "赞", "同意"], ["+1", "thumbs_up", "👍"]),
  defineChatReactionOption("+1_dark_skin_tone", "👍🏿", "点赞", ["like", "agree", "赞", "同意", "dark"], ["thumbsup_dark_skin_tone", "👍🏿"]),
  defineChatReactionOption("thumbsdown", "👎", "反对", ["disagree", "不同意", "踩"], ["-1", "thumbs_down", "👎"]),
  defineChatReactionOption("one", "1️⃣", "收到 1", ["one", "1", "收到"], ["1", "one", "1️⃣"]),
  defineChatReactionOption("six", "6️⃣", "收到 6", ["six", "6", "收到"], ["6", "six", "6️⃣"]),
  defineChatReactionOption("eyes", "👀", "已关注", ["watch", "看", "关注"], ["👀"]),
  defineChatReactionOption("white_check_mark", "✅", "完成", ["done", "check", "完成", "确认"], ["check", "done", "✅"]),
  defineChatReactionOption("heart", "❤️", "喜欢", ["love", "喜欢", "支持"], ["❤️", "❤"]),
  defineChatReactionOption("smiling_face_with_3_hearts", "🥰", "很喜欢", ["love", "喜欢", "开心"], ["🥰"]),
  defineChatReactionOption("anatomical_heart", "🫀", "用心", ["heart", "用心"], ["🫀"]),
  defineChatReactionOption("fire", "🔥", "很棒", ["hot", "棒", "强"], ["🔥"]),
  defineChatReactionOption("tada", "🎉", "庆祝", ["celebrate", "party", "庆祝"], ["🎉"]),
  defineChatReactionOption("joy", "😂", "好笑", ["laugh", "笑", "哈哈"], ["😂"]),
  defineChatReactionOption("open_mouth", "😮", "惊讶", ["surprise", "惊讶"], ["😮"]),
  defineChatReactionOption("fearful", "😨", "害怕", ["fear", "害怕", "担心"], ["😨"]),
  defineChatReactionOption("innocent", "😇", "无辜", ["innocent", "无辜"], ["😇"]),
  defineChatReactionOption("nerd_face", "🤓", "较真", ["nerd", "认真", "较真"], ["🤓"]),
  defineChatReactionOption("relaxed", "☺️", "放松", ["relaxed", "放松"], ["☺", "☺️"]),
  defineChatReactionOption("yum", "😋", "好吃", ["yum", "好吃", "开心"], ["😋"]),
  defineChatReactionOption("woozy_face", "🥴", "晕", ["woozy", "晕", "迷糊"], ["🥴"]),
  defineChatReactionOption("call_me_hand", "🤙", "联系我", ["call", "联系"], ["🤙"]),
  defineChatReactionOption("pray", "🙏", "感谢", ["thanks", "please", "感谢", "拜托"], ["🙏"]),
  defineChatReactionOption("clap", "👏", "鼓掌", ["applause", "鼓掌"], ["👏"]),
  defineChatReactionOption("rocket", "🚀", "推进", ["ship", "launch", "推进", "发布"], ["🚀"]),
  defineChatReactionOption("thinking_face", "🤔", "思考", ["think", "考虑", "思考"], ["thinking", "🤔"]),
  defineChatReactionOption("sob", "😭", "难过", ["cry", "哭", "难受"], ["😭"]),
  defineChatReactionOption("confused", "😕", "困惑", ["confuse", "不懂", "疑惑"], ["😕"]),
  defineChatReactionOption("clown_face", "🤡", "离谱", ["clown", "离谱"], ["🤡"]),
  defineChatReactionOption("raised_hands", "🙌", "赞成", ["raise", "支持", "赞成"], ["🙌"]),
  defineChatReactionOption("muscle", "💪", "加油", ["strong", "加油", "努力"], ["💪"]),
  defineChatReactionOption("ok_hand", "👌", "可以", ["ok", "可以"], ["👌"]),
  defineChatReactionOption("wave", "👋", "收到", ["hi", "hello", "收到"], ["👋"]),
  defineChatReactionOption("point_up", "☝️", "重点", ["point", "重点"], ["☝️", "☝"]),
  defineChatReactionOption("memo", "📝", "记录", ["note", "记录", "文档"], ["📝"]),
  defineChatReactionOption("warning", "⚠️", "注意", ["warn", "风险", "注意"], ["⚠️", "⚠"]),
  defineChatReactionOption("question", "❓", "疑问", ["question", "问题", "疑问"], ["❓"]),
  defineChatReactionOption("bulb", "💡", "想法", ["idea", "想法", "灵感"], ["idea", "💡"]),
  defineChatReactionOption("mag", "🔍", "检查", ["search", "review", "检查"], ["🔍"]),
  defineChatReactionOption("100", "💯", "满分", ["perfect", "满分"], ["💯"]),
  defineChatReactionOption("x", "❌", "不通过", ["no", "reject", "不行"], ["❌"]),
  defineChatReactionOption("heavy_check_mark", "✔️", "通过", ["pass", "ok", "通过"], ["✔️", "✔"]),
  defineChatReactionOption("sparkles", "✨", "亮点", ["shine", "亮点"], ["✨"]),
  defineChatReactionOption("star", "⭐", "收藏", ["favorite", "star", "收藏"], ["⭐"]),
  defineChatReactionOption("coffee", "☕", "休息", ["break", "coffee", "休息"], ["☕"]),
  defineChatReactionOption("calendar", "📅", "排期", ["date", "schedule", "排期"], ["📅"]),
  defineChatReactionOption("pushpin", "📌", "固定", ["pin", "固定"], ["📌"]),
  defineChatReactionOption("link", "🔗", "链接", ["url", "链接"], ["🔗"]),
  defineChatReactionOption("rotating_light", "🚨", "紧急", ["urgent", "alert", "紧急"], ["🚨"]),
];

// Deprecated reactions stay stored as history but no longer participate in the chat UI.
const hiddenChatReactionTokens = new Set(["bug", "🐛"].map(normalizeReactionToken));

const reactionOptionsByToken = new Map<string, ChatReactionOption>();
const reactionDisplaySymbols = new Set<string>();

for (const option of chatReactionOptions) {
  reactionDisplaySymbols.add(option.symbol);
  reactionOptionsByToken.set(normalizeReactionToken(option.emojiName), option);
  reactionOptionsByToken.set(normalizeReactionToken(option.symbol), option);
  for (const alias of option.aliases ?? []) {
    reactionOptionsByToken.set(normalizeReactionToken(alias), option);
    if (hasNonAscii(alias)) reactionDisplaySymbols.add(alias);
  }
}

const reactionDisplaySymbolPattern = new RegExp(
  `(?:${[...reactionDisplaySymbols]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|")})|(?::([A-Za-z0-9_+.-]+):)`,
  "gu",
);

export const quickChatReactionOptions = ["thumbsup", "rolling_on_the_floor_laughing", "one"].flatMap((emojiName) => {
  const option = findChatReactionOption(emojiName);
  return option ? [option] : [];
});

export function findChatReactionOption(value: string) {
  return reactionOptionsByToken.get(normalizeReactionToken(value)) ?? null;
}

export function canonicalChatReactionName(value: string) {
  return findChatReactionOption(value)?.emojiName ?? value.trim();
}

export function displayChatReactionEmoji(emojiName: string) {
  const trimmed = emojiName.trim();
  const option = findChatReactionOption(trimmed);
  if (option) return option.symbol;
  return /^[a-z0-9_+-]+$/i.test(trimmed) ? `:${trimmed}:` : trimmed;
}

export function labelChatReactionEmoji(emojiName: string) {
  const trimmed = emojiName.trim();
  return findChatReactionOption(trimmed)?.label ?? displayChatReactionEmoji(trimmed);
}

export function isVisibleChatReactionEmoji(emojiName: string) {
  return !hiddenChatReactionTokens.has(normalizeReactionToken(emojiName));
}

export function searchChatReactionOptions(query: string) {
  const normalizedQuery = normalizeReactionToken(query);
  if (!normalizedQuery) return chatReactionOptions;
  return chatReactionOptions.filter((option) => {
    const tokens = [option.emojiName, option.symbol, option.label, ...option.keywords, ...(option.aliases ?? [])];
    return tokens.some((token) => normalizeReactionToken(token).includes(normalizedQuery));
  });
}

export function preferredReactionName(existingEmojiNames: string[], selectedEmojiName: string) {
  const selectedOption = findChatReactionOption(selectedEmojiName);
  if (!selectedOption) return selectedEmojiName;
  const existingMatch = existingEmojiNames.find((emojiName) => findChatReactionOption(emojiName)?.emojiName === selectedOption.emojiName);
  return existingMatch ?? selectedOption.emojiName;
}

export type ChatReactionEmojiTextToken =
  | { emojiName: string; kind: "emoji" }
  | { kind: "text"; text: string };

export function tokenizeChatReactionEmojiText(text: string): ChatReactionEmojiTextToken[] {
  if (!text) return [];

  const tokens: ChatReactionEmojiTextToken[] = [];
  let index = 0;
  reactionDisplaySymbolPattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = reactionDisplaySymbolPattern.exec(text)) !== null) {
    const symbol = match[0] ?? "";
    const shortcode = match[1] ?? "";
    if (match.index > index) tokens.push({ kind: "text", text: text.slice(index, match.index) });
    const option = findChatReactionOption(shortcode || symbol);
    tokens.push(option ? { emojiName: option.emojiName, kind: "emoji" } : { kind: "text", text: symbol });
    index = reactionDisplaySymbolPattern.lastIndex;
  }

  if (index < text.length) tokens.push({ kind: "text", text: text.slice(index) });
  return tokens;
}

function normalizeReactionToken(value: string) {
  return value.trim().toLowerCase().replace(/^:+|:+$/g, "");
}

function hasNonAscii(value: string) {
  return /[^\x00-\x7F]/.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
