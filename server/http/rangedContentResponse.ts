import type { Readable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  byteRangeContentLength,
  byteRangeContentRangeHeader,
  byteRangeUnsatisfiedContentRangeHeader,
  parseByteRangeHeader,
  type ByteRangeSelection,
  type ResolvedByteRange,
} from "@orf/module-protocol";

export type RangedContentResponse = {
  readonly body: Readable;
  readonly cacheControl: string;
  readonly contentDisposition?: string;
  readonly contentLength?: number;
  readonly contentType: string;
  readonly range?: ResolvedByteRange;
  readonly totalContentLength?: number;
  readonly xContentTypeOptions?: "nosniff";
};

export function byteRangeSelectionFromRequest(request: FastifyRequest): ByteRangeSelection {
  return parseByteRangeHeader(request.headers.range);
}

export function sendByteRangeNotSatisfiable(reply: FastifyReply, totalContentLength: number) {
  reply.header("Accept-Ranges", "bytes");
  reply.header("Content-Range", byteRangeUnsatisfiedContentRangeHeader(totalContentLength));
  return reply.code(416).send();
}

export function sendRangedContent(reply: FastifyReply, response: RangedContentResponse) {
  reply.header("Cache-Control", response.cacheControl);
  reply.header("Content-Type", response.contentType);
  if (response.contentDisposition) reply.header("Content-Disposition", response.contentDisposition);
  if (response.xContentTypeOptions) reply.header("X-Content-Type-Options", response.xContentTypeOptions);

  const knownTotalLength = response.range?.totalLength ?? response.totalContentLength;
  if (knownTotalLength !== undefined) reply.header("Accept-Ranges", "bytes");

  if (response.range) {
    reply.code(206);
    reply.header("Content-Range", byteRangeContentRangeHeader(response.range));
    reply.header("Content-Length", byteRangeContentLength(response.range));
  } else if (response.contentLength !== undefined) {
    reply.header("Content-Length", response.contentLength);
  }

  return reply.send(response.body);
}
