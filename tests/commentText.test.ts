import assert from "node:assert/strict";
import test from "node:test";
import { parseCommentBodyLinks } from "../src/features/challenge/comments/commentText";

test("parseCommentBodyLinks turns pasted http links into safe link tokens", () => {
  assert.deepEqual(parseCommentBodyLinks("看这个 https://orf.example.com/a?x=1 再讨论"), [
    { type: "text", value: "看这个 " },
    { type: "link", value: "https://orf.example.com/a?x=1", href: "https://orf.example.com/a?x=1" },
    { type: "text", value: " 再讨论" },
  ]);
});

test("parseCommentBodyLinks supports bare www links without changing visible text", () => {
  assert.deepEqual(parseCommentBodyLinks("入口 www.example.com/path."), [
    { type: "text", value: "入口 " },
    { type: "link", value: "www.example.com/path", href: "https://www.example.com/path" },
    { type: "text", value: "." },
  ]);
});

test("parseCommentBodyLinks excludes sentence punctuation but keeps balanced URL punctuation", () => {
  assert.deepEqual(parseCommentBodyLinks("参考 (https://example.com/a_(b))."), [
    { type: "text", value: "参考 (" },
    { type: "link", value: "https://example.com/a_(b)", href: "https://example.com/a_(b)" },
    { type: "text", value: ")." },
  ]);
});

test("parseCommentBodyLinks leaves unsupported schemes as text", () => {
  assert.deepEqual(parseCommentBodyLinks("不要转 ftp://example.com 或 javascript:alert(1)"), [
    { type: "text", value: "不要转 ftp://example.com 或 javascript:alert(1)" },
  ]);
});

test("parseCommentBodyLinks hides a standalone URL when the previous line is a title", () => {
  assert.deepEqual(parseCommentBodyLinks("【快速傅里叶变换(FFT)——有史以来最巧妙的算法?】\nhttps://www.bilibili.com/video/BV1za411F76U/\n后续说明"), [
    {
      type: "link",
      value: "【快速傅里叶变换(FFT)——有史以来最巧妙的算法?】",
      href: "https://www.bilibili.com/video/BV1za411F76U/",
    },
    { type: "text", value: "\n后续说明" },
  ]);
});

test("parseCommentBodyLinks hides a URL that follows a title on the same logical line", () => {
  assert.deepEqual(
    parseCommentBodyLinks(
      "【快速傅里叶变换(FFT)——有史以来最巧妙的算法?】 https://www.bilibili.com/video/BV1za411F76U/?share_source=copy_web&vd_source=6e9b15a670a2e3e0c47195c42806b82a",
    ),
    [
      {
        type: "link",
        value: "【快速傅里叶变换(FFT)——有史以来最巧妙的算法?】",
        href: "https://www.bilibili.com/video/BV1za411F76U/?share_source=copy_web&vd_source=6e9b15a670a2e3e0c47195c42806b82a",
      },
    ],
  );
});

test("parseCommentBodyLinks keeps short lead-in text separate from the URL", () => {
  assert.deepEqual(parseCommentBodyLinks("看这个\nhttps://example.com/path"), [
    { type: "text", value: "看这个\n" },
    { type: "link", value: "https://example.com/path", href: "https://example.com/path" },
  ]);
});

test("parseCommentBodyLinks keeps short same-line lead-in text separate from the URL", () => {
  assert.deepEqual(parseCommentBodyLinks("看这个 https://example.com/path"), [
    { type: "text", value: "看这个 " },
    { type: "link", value: "https://example.com/path", href: "https://example.com/path" },
  ]);
});
