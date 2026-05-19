import type { InputValueKind, PayloadKind } from "./types";

export const payloadKinds: PayloadKind[] = ["asciiText"];

export function payloadForKind(kind: PayloadKind) {
  switch (kind) {
    case "emptyText":
      return "";
    case "asciiText":
      return "alpha-test";
    case "unicodeText":
      return "中文输入";
    case "emojiText":
      return "🙂🔥✅";
    case "whitespaceText":
      return "   \t   ";
    case "longText":
      return "long-text-".repeat(20);
    case "veryLongText":
      return "very-long-text-".repeat(80);
    case "structuredText":
      return '{"kind":"ui-explorer","value":42}';
    case "malformedText":
      return "<script>alert(";
    case "emailLikeText":
      return "ui.explorer@example.test";
    case "numberLikeText":
      return "1234567890";
    case "multiLineText":
      return "first line\nsecond line\nthird line";
  }
}

export function payloadKindToValueKind(kind: PayloadKind): InputValueKind {
  switch (kind) {
    case "emptyText":
      return "empty";
    case "asciiText":
      return "short";
    case "unicodeText":
      return "unicode";
    case "emojiText":
      return "emoji";
    case "whitespaceText":
      return "whitespaceOnly";
    case "longText":
      return "long";
    case "veryLongText":
      return "veryLong";
    case "structuredText":
      return "structured";
    case "malformedText":
      return "malformed";
    case "emailLikeText":
      return "emailLike";
    case "numberLikeText":
      return "numberLike";
    case "multiLineText":
      return "multiLine";
  }
}
