import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrfRichTextMarkdownViewer } from "../src/features/rich-text/OrfRichTextMarkdownViewer";
import { normalizePastedOrfRichText } from "../src/features/rich-text/orfRichTextClipboard";

test("rich text paste normalizes external ordered list markers and continuations", () => {
  const normalized = normalizePastedOrfRichText([
    "1、A 端问题确认",
    "A 端 15:54 后新对象曾卡在 PENDING",
    "  • rule_id=A-primary",
    "1) A 端修正",
    "A outbound rule 当前保持",
    "（2）A->B 新增验证",
  ].join("\n"));

  assert.equal(normalized, [
    "1. A 端问题确认",
    "    A 端 15:54 后新对象曾卡在 PENDING",
    "  - rule_id=A-primary",
    "1. A 端修正",
    "    A outbound rule 当前保持",
    "2. A->B 新增验证",
  ].join("\n"));
});

test("rich text viewer keeps list continuations and nested lists inside one ordered list", () => {
  const body = [
    "1. A 端问题确认",
    "    A 端 15:54 后新对象曾卡在 PENDING",
    "  - rule_id=A-primary",
    "1. A 端修正",
    "    A outbound rule 当前保持",
  ].join("\n");
  const html = renderToStaticMarkup(React.createElement(OrfRichTextMarkdownViewer, { body }));

  assert.match(html, /<ol class="orf-rich-text-viewer-list orf-rich-text-markdown-list">/);
  assert.equal((html.match(/<ol /g) ?? []).length, 1);
  assert.equal((html.match(/<li/g) ?? []).length, 3);
  assert.match(html, /A 端 15:54 后新对象曾卡在 PENDING/);
  assert.match(html, /<ul class="orf-rich-text-viewer-list orf-rich-text-markdown-list">/);
});
