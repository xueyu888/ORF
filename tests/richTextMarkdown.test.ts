import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("rich text paste keeps blank-line-separated bold sections outside list continuations", () => {
  const normalized = normalizePastedOrfRichText([
    "**今日完成： **",
    "",
    "- 把反馈处理人体系重新理顺了。",
    "- 评论通知能带上正文和图片。",
    "",
    "**当前问题： **",
    "",
    "- 无。",
  ].join("\n"));

  assert.equal(normalized, [
    "**今日完成： **",
    "",
    "- 把反馈处理人体系重新理顺了。",
    "- 评论通知能带上正文和图片。",
    "",
    "**当前问题： **",
    "",
    "- 无。",
  ].join("\n"));

  const html = renderToStaticMarkup(React.createElement(OrfRichTextMarkdownViewer, {
    body: normalized,
    compact: true,
  }));

  assert.doesNotMatch(html, /orf-rich-text-markdown-code-block/);
  assert.match(html, /<strong><span>当前问题： <\/span><\/strong>/);
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

  assert.match(html, /<ol class="orf-rich-text-markdown-list">/);
  assert.equal((html.match(/<ol /g) ?? []).length, 1);
  assert.equal((html.match(/<li/g) ?? []).length, 3);
  assert.match(html, /A 端 15:54 后新对象曾卡在 PENDING/);
  assert.match(html, /<ul class="orf-rich-text-markdown-list">/);
});

test("rich text viewer renders headings with shared markdown classes", () => {
  const html = renderToStaticMarkup(React.createElement(OrfRichTextMarkdownViewer, {
    body: "## 二级\n\n#### 四级",
    compact: true,
  }));

  assert.match(html, /<h4 class="orf-rich-text-markdown-heading orf-rich-text-markdown-heading-2 orf-rich-text-markdown-heading-compact">/);
  assert.match(html, /<h4 class="orf-rich-text-markdown-heading orf-rich-text-markdown-heading-4 orf-rich-text-markdown-heading-compact">/);
  for (const prefix of ["chat", "work-log", "comment", "drive"]) {
    assert.doesNotMatch(html, new RegExp(`orf-${prefix}-markdown`));
  }
});

test("rich text compact heading styles preserve markdown heading levels", () => {
  const css = readFileSync("src/styles/controls.css", "utf8");
  assert.match(css, /\.orf-rich-text-markdown-heading-2\.orf-rich-text-markdown-heading-compact\s*\{[^}]*font-size:\s*1\.28em;/s);
  assert.match(css, /\.orf-rich-text-markdown-heading-4\.orf-rich-text-markdown-heading-compact,[^}]*\{[^}]*font-size:\s*1\.08em;/s);
});
