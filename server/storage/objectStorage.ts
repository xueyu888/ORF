import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { byteRangeRequestHeader, type ByteRangeSegment } from "@orf/module-protocol";
import { env } from "../env";

export type StoredObject = {
  body: Readable;
  contentLength?: number;
  contentType?: string;
};

export type GetObjectOptions = {
  readonly byteRange?: ByteRangeSegment;
};

export interface ObjectStorage {
  deleteObject(key: string): Promise<void>;
  getObject(key: string, options?: GetObjectOptions): Promise<StoredObject | null>;
  putObject(input: {
    body: Buffer;
    contentLength: number;
    contentType: string;
    key: string;
  }): Promise<void>;
  putObjectStream(input: {
    body: Readable;
    contentType: string;
    key: string;
    maxBytes: number;
    peekBytes?: number;
  }): Promise<{ contentLength: number; peeked: Buffer }>;
}

export class ObjectStorageUploadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super("object too large");
    this.name = "ObjectStorageUploadTooLargeError";
  }
}

export class ObjectStorageUploadEmptyError extends Error {
  constructor() {
    super("object is empty");
    this.name = "ObjectStorageUploadEmptyError";
  }
}

const streamUploadPartSize = 64 * 1024 * 1024;

function isNoSuchObjectError(error: unknown) {
  return error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound");
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    this.bucket = env.OBJECT_STORAGE_BUCKET;
    this.client = new S3Client({
      credentials: {
        accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
      },
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE,
      region: env.OBJECT_STORAGE_REGION,
    });
  }

  async putObject(input: {
    body: Buffer;
    contentLength: number;
    contentType: string;
    key: string;
  }) {
    await this.client.send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: this.bucket,
        ContentLength: input.contentLength,
        ContentType: input.contentType,
        Key: input.key,
      }),
    );
  }

  private async uploadMultipartPart(input: { body: Buffer; key: string; partNumber: number; uploadId: string }) {
    const response = await this.client.send(
      new UploadPartCommand({
        Body: input.body,
        Bucket: this.bucket,
        Key: input.key,
        PartNumber: input.partNumber,
        UploadId: input.uploadId,
      }),
    );
    if (!response.ETag) {
      throw new Error("missing multipart upload etag");
    }
    return {
      ETag: response.ETag,
      PartNumber: input.partNumber,
    } satisfies CompletedPart;
  }

  async putObjectStream(input: {
    body: Readable;
    contentType: string;
    key: string;
    maxBytes: number;
    peekBytes?: number;
  }) {
    const createResponse = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        ContentType: input.contentType,
        Key: input.key,
      }),
    );
    const uploadId = createResponse.UploadId;
    if (!uploadId) {
      throw new Error("missing multipart upload id");
    }

    const completedParts: CompletedPart[] = [];
    const partChunks: Buffer[] = [];
    const peekChunks: Buffer[] = [];
    const peekLimit = Math.max(0, input.peekBytes ?? 0);
    let contentLength = 0;
    let partBytes = 0;
    let partNumber = 1;
    let peekedBytes = 0;

    const takeNextPart = () => {
      const part = Buffer.allocUnsafe(streamUploadPartSize);
      let offset = 0;
      while (offset < streamUploadPartSize) {
        const current = partChunks[0];
        if (!current) {
          throw new Error("multipart part underflow");
        }
        const take = Math.min(current.byteLength, streamUploadPartSize - offset);
        current.copy(part, offset, 0, take);
        offset += take;
        partBytes -= take;
        if (take === current.byteLength) {
          partChunks.shift();
        } else {
          partChunks[0] = current.subarray(take);
        }
      }
      return part;
    };

    const uploadFullParts = async () => {
      while (partBytes >= streamUploadPartSize) {
        const part = takeNextPart();
        completedParts.push(await this.uploadMultipartPart({ body: part, key: input.key, partNumber, uploadId }));
        partNumber += 1;
      }
    };

    try {
      for await (const rawChunk of input.body) {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array);
        contentLength += chunk.byteLength;
        if (contentLength > input.maxBytes) {
          input.body.destroy(new ObjectStorageUploadTooLargeError(input.maxBytes));
          throw new ObjectStorageUploadTooLargeError(input.maxBytes);
        }

        if (peekedBytes < peekLimit) {
          const peekChunk = chunk.subarray(0, Math.min(chunk.byteLength, peekLimit - peekedBytes));
          peekChunks.push(peekChunk);
          peekedBytes += peekChunk.byteLength;
        }

        partChunks.push(chunk);
        partBytes += chunk.byteLength;
        await uploadFullParts();
      }

      if (contentLength === 0) {
        throw new ObjectStorageUploadEmptyError();
      }

      if (partBytes > 0) {
        completedParts.push(
          await this.uploadMultipartPart({
            body: Buffer.concat(partChunks, partBytes),
            key: input.key,
            partNumber,
            uploadId,
          }),
        );
      }

      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: input.key,
          MultipartUpload: {
            Parts: completedParts,
          },
          UploadId: uploadId,
        }),
      );

      return {
        contentLength,
        peeked: Buffer.concat(peekChunks, peekedBytes),
      };
    } catch (error) {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: input.key,
          UploadId: uploadId,
        }),
      ).catch(() => undefined);
      throw error;
    }
  }

  async getObject(key: string, options: GetObjectOptions = {}): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: options.byteRange ? byteRangeRequestHeader(options.byteRange) : undefined,
        }),
      );

      if (!response.Body || typeof response.Body !== "object" || !("pipe" in response.Body)) {
        return null;
      }

      return {
        body: response.Body as Readable,
        contentLength: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (error) {
      if (isNoSuchObjectError(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

export const objectStorage: ObjectStorage = new S3ObjectStorage();
