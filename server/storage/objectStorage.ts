import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { env } from "../env";

export type StoredObject = {
  body: Readable;
  contentLength?: number;
  contentType?: string;
};

export interface ObjectStorage {
  deleteObject(key: string): Promise<void>;
  getObject(key: string): Promise<StoredObject | null>;
  putObject(input: {
    body: Buffer;
    contentLength: number;
    contentType: string;
    key: string;
  }): Promise<void>;
}

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

  async getObject(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
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
