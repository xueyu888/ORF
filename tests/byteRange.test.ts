import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import type { FastifyReply } from "fastify";
import {
  byteRangeContentLength,
  byteRangeContentRangeHeader,
  byteRangeRequestHeader,
  byteRangeUnsatisfiedContentRangeHeader,
  parseByteRangeHeader,
  resolveByteRangeSelection,
} from "@orf/module-protocol";
import {
  sendByteRangeNotSatisfiable,
  sendRangedContent,
} from "../server/http/rangedContentResponse";

test("byte range parser accepts a single bounded range", () => {
  assert.deepEqual(parseByteRangeHeader("bytes=10-19"), {
    status: "ok",
    request: { kind: "bounded", start: 10, end: 19 },
  });
});

test("byte range parser accepts open ended and suffix ranges", () => {
  assert.deepEqual(parseByteRangeHeader("bytes=10-"), {
    status: "ok",
    request: { kind: "bounded", start: 10, end: null },
  });
  assert.deepEqual(parseByteRangeHeader("bytes=-25"), {
    status: "ok",
    request: { kind: "suffix", suffixLength: 25 },
  });
});

test("byte range parser rejects invalid and multipart ranges", () => {
  assert.deepEqual(parseByteRangeHeader(undefined), { status: "none" });
  assert.deepEqual(parseByteRangeHeader("bytes=20-10"), { status: "invalid" });
  assert.deepEqual(parseByteRangeHeader("items=0-1"), { status: "invalid" });
  assert.deepEqual(parseByteRangeHeader("bytes=0-1,4-5"), { status: "invalid" });
  assert.deepEqual(parseByteRangeHeader(["bytes=0-1", "bytes=2-3"]), { status: "invalid" });
});

test("byte range resolver clamps satisfiable ranges to content length", () => {
  const resolved = resolveByteRangeSelection(parseByteRangeHeader("bytes=95-200"), 100);
  assert.deepEqual(resolved, {
    status: "satisfiable",
    range: { start: 95, end: 99, totalLength: 100 },
  });
  if (resolved.status !== "satisfiable") throw new Error("expected satisfiable range");
  assert.equal(byteRangeContentLength(resolved.range), 5);
  assert.equal(byteRangeContentRangeHeader(resolved.range), "bytes 95-99/100");
  assert.equal(byteRangeRequestHeader(resolved.range), "bytes=95-99");
});

test("byte range resolver supports suffix ranges larger than the object", () => {
  assert.deepEqual(resolveByteRangeSelection(parseByteRangeHeader("bytes=-150"), 100), {
    status: "satisfiable",
    range: { start: 0, end: 99, totalLength: 100 },
  });
});

test("byte range resolver marks invalid and out of bounds ranges unsatisfiable", () => {
  assert.deepEqual(resolveByteRangeSelection(parseByteRangeHeader("bytes=100-200"), 100), {
    status: "unsatisfiable",
    totalLength: 100,
  });
  assert.deepEqual(resolveByteRangeSelection(parseByteRangeHeader("bytes=abc"), 100), {
    status: "unsatisfiable",
    totalLength: 100,
  });
  assert.equal(byteRangeUnsatisfiedContentRangeHeader(100), "bytes */100");
});

test("ranged content response emits partial content headers", () => {
  const reply = new MockReply();
  const body = Readable.from(["0123456789"]);
  sendRangedContent(reply as unknown as FastifyReply, {
    body,
    cacheControl: "private, max-age=60",
    contentType: "video/mp4",
    range: { start: 10, end: 19, totalLength: 100 },
    totalContentLength: 100,
  });

  assert.equal(reply.statusCode, 206);
  assert.equal(reply.headers.get("Accept-Ranges"), "bytes");
  assert.equal(reply.headers.get("Cache-Control"), "private, max-age=60");
  assert.equal(reply.headers.get("Content-Length"), 10);
  assert.equal(reply.headers.get("Content-Range"), "bytes 10-19/100");
  assert.equal(reply.headers.get("Content-Type"), "video/mp4");
  assert.equal(reply.body, body);
});

test("ranged content response emits unsatisfiable range headers", () => {
  const reply = new MockReply();
  sendByteRangeNotSatisfiable(reply as unknown as FastifyReply, 100);

  assert.equal(reply.statusCode, 416);
  assert.equal(reply.headers.get("Accept-Ranges"), "bytes");
  assert.equal(reply.headers.get("Content-Range"), "bytes */100");
});

class MockReply {
  readonly headers = new Map<string, unknown>();
  statusCode = 200;
  body: unknown;

  code(statusCode: number) {
    this.statusCode = statusCode;
    return this;
  }

  header(name: string, value: unknown) {
    this.headers.set(name, value);
    return this;
  }

  send(body?: unknown) {
    this.body = body;
    return this;
  }
}
