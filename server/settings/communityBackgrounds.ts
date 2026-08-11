import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { VisualBackgroundScene as CanonicalBackgroundScene } from "../../src/domain/settings/visualBackgrounds";
import type { VisualBackgroundImage } from "./visualBackgrounds";
import { ensurePrivateSettingsStorage, privateCommunitySettingsDirectory } from "./settingsStorage";

const communityBackgroundMetadataSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  ownerUserId: z.string().min(1),
  sourcePersonalBackgroundId: z.string().min(1),
  fileName: z.string().min(1),
  storedFileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  withdrawnAt: z.string().datetime().nullable(),
});

type CommunityBackgroundMetadata = z.infer<typeof communityBackgroundMetadataSchema>;
type CommunityBackgroundState = "active" | "withdrawn";

export type CommunityBackgroundSourceState = {
  shareId: string;
  state: CommunityBackgroundState;
  role: "shared-source";
  canWithdraw: boolean;
};

const scopeMutationQueues = new Map<string, Promise<void>>();

function safeScopeSegment(scopeId: string) {
  return Buffer.from(scopeId, "utf8").toString("base64url");
}

function communityBackgroundRoot(scopeId: string) {
  return path.join(privateCommunitySettingsDirectory(safeScopeSegment(scopeId)), "backgrounds");
}

function communityBackgroundDir(scopeId: string, shareId: string) {
  return path.join(communityBackgroundRoot(scopeId), shareId);
}

function communityBackgroundMetadataPath(scopeId: string, shareId: string) {
  return path.join(communityBackgroundDir(scopeId, shareId), "metadata.json");
}

function communityBackgroundId(shareId: string) {
  return `community/${shareId}`;
}

function parseCommunityBackgroundId(id: string) {
  let decodedId: string;
  try {
    decodedId = decodeURIComponent(id);
  } catch {
    throw new Error("community background not found");
  }
  const match = /^community\/([0-9a-f-]{36})$/i.exec(decodedId);
  if (!match) {
    throw new Error("community background not found");
  }
  return z.string().uuid().parse(match[1]);
}

function isMissingFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function stateOf(metadata: CommunityBackgroundMetadata): CommunityBackgroundState {
  return metadata.withdrawnAt ? "withdrawn" : "active";
}

function isSafeStoredFileName(fileName: string) {
  return Boolean(fileName) && path.basename(fileName) === fileName && !fileName.includes("/") && !fileName.includes("\\");
}

function storedImageFileName(fileName: string, mimeType: string) {
  const sourceExtension = path.extname(fileName).toLowerCase();
  const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
  if (allowedExtensions.has(sourceExtension)) return `image${sourceExtension}`;
  const extension = mimeType === "image/jpeg"
    ? ".jpg"
    : mimeType === "image/webp"
      ? ".webp"
      : mimeType === "image/gif"
        ? ".gif"
        : mimeType === "image/avif"
          ? ".avif"
          : ".png";
  return `image${extension}`;
}

async function runScopeMutation<T>(scopeId: string, operation: () => Promise<T>) {
  const previous = scopeMutationQueues.get(scopeId) ?? Promise.resolve();
  const mutation = previous.then(operation);
  const settled = mutation.then(() => undefined, () => undefined);
  scopeMutationQueues.set(scopeId, settled);
  return mutation.finally(() => {
    if (scopeMutationQueues.get(scopeId) === settled) {
      scopeMutationQueues.delete(scopeId);
    }
  });
}

async function readCommunityBackgroundMetadata(scopeId: string, shareId: string) {
  try {
    const raw = JSON.parse(await readFile(communityBackgroundMetadataPath(scopeId, shareId), "utf8")) as unknown;
    const metadata = communityBackgroundMetadataSchema.parse(raw);
    if (metadata.id !== shareId || !isSafeStoredFileName(metadata.storedFileName)) {
      throw new Error("community background not found");
    }
    return metadata;
  } catch (error) {
    if (isMissingFile(error) || error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new Error("community background not found");
    }
    throw error;
  }
}

async function listCommunityBackgroundMetadata(scopeId: string) {
  await ensurePrivateSettingsStorage();
  const entries = await readdir(communityBackgroundRoot(scopeId), { withFileTypes: true }).catch((error) => {
    if (isMissingFile(error)) return [];
    throw error;
  });
  const records = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      return await readCommunityBackgroundMetadata(scopeId, entry.name);
    } catch (error) {
      if (error instanceof Error && error.message === "community background not found") return null;
      throw error;
    }
  }));
  return records
    .filter((record): record is CommunityBackgroundMetadata => Boolean(record))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function writeCommunityBackgroundMetadata(scopeId: string, metadata: CommunityBackgroundMetadata) {
  const directory = communityBackgroundDir(scopeId, metadata.id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const targetPath = communityBackgroundMetadataPath(scopeId, metadata.id);
  const tempPath = `${targetPath}.${process.pid}.${Date.now().toString(36)}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function toCommunityBackgroundImage(
  metadata: CommunityBackgroundMetadata,
  scene: CanonicalBackgroundScene,
  userId: string,
): VisualBackgroundImage {
  const state = stateOf(metadata);
  const id = communityBackgroundId(metadata.id);
  return {
    id,
    scene,
    fileName: metadata.fileName,
    url: `/settings/community-backgrounds/${metadata.id}`,
    fileKey: id,
    mimeType: metadata.mimeType,
    fileSize: metadata.fileSize,
    isDefault: false,
    createdAt: metadata.createdAt,
    community: {
      shareId: metadata.id,
      state,
      role: "community-copy",
      canWithdraw: metadata.ownerUserId === userId && state === "active",
    },
  };
}

export async function listCommunityBackgrounds(input: {
  scopeId: string;
  userId: string;
  scene: CanonicalBackgroundScene;
  referencedIds: ReadonlySet<string>;
}) {
  const records = await listCommunityBackgroundMetadata(input.scopeId);
  const images = records
    .filter((record) => !record.withdrawnAt || input.referencedIds.has(communityBackgroundId(record.id)))
    .map((record) => toCommunityBackgroundImage(record, input.scene, input.userId));
  const sourceStates = new Map<string, CommunityBackgroundSourceState>();
  for (const record of records) {
    if (record.ownerUserId !== input.userId) continue;
    sourceStates.set(record.sourcePersonalBackgroundId, {
      shareId: record.id,
      state: stateOf(record),
      role: "shared-source",
      canWithdraw: !record.withdrawnAt,
    });
  }
  return { images, sourceStates };
}

export async function shareCommunityBackground(input: {
  scopeId: string;
  userId: string;
  sourcePersonalBackgroundId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  scene: CanonicalBackgroundScene;
}) {
  return runScopeMutation(input.scopeId, async () => {
    const existing = (await listCommunityBackgroundMetadata(input.scopeId)).find(
      (record) => record.ownerUserId === input.userId && record.sourcePersonalBackgroundId === input.sourcePersonalBackgroundId,
    );
    if (existing) {
      if (existing.withdrawnAt) {
        existing.withdrawnAt = null;
        await writeCommunityBackgroundMetadata(input.scopeId, existing);
      }
      return toCommunityBackgroundImage(existing, input.scene, input.userId);
    }

    const id = randomUUID();
    const storedFileName = storedImageFileName(input.fileName, input.mimeType);
    const directory = communityBackgroundDir(input.scopeId, id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, storedFileName), input.buffer, { flag: "wx", mode: 0o600 });
    const metadata: CommunityBackgroundMetadata = {
      version: 1,
      id,
      ownerUserId: input.userId,
      sourcePersonalBackgroundId: input.sourcePersonalBackgroundId,
      fileName: input.fileName,
      storedFileName,
      mimeType: input.mimeType,
      fileSize: input.buffer.length,
      createdAt: new Date().toISOString(),
      withdrawnAt: null,
    };
    await writeCommunityBackgroundMetadata(input.scopeId, metadata);
    return toCommunityBackgroundImage(metadata, input.scene, input.userId);
  });
}

export async function withdrawCommunityBackground(input: { scopeId: string; userId: string; shareId: string }) {
  const shareId = z.string().uuid().parse(input.shareId);
  return runScopeMutation(input.scopeId, async () => {
    const metadata = await readCommunityBackgroundMetadata(input.scopeId, shareId);
    if (metadata.ownerUserId !== input.userId) {
      throw new Error("community background forbidden");
    }
    if (!metadata.withdrawnAt) {
      metadata.withdrawnAt = new Date().toISOString();
      await writeCommunityBackgroundMetadata(input.scopeId, metadata);
    }
    return { id: communityBackgroundId(metadata.id), shareId: metadata.id, withdrawnAt: metadata.withdrawnAt };
  });
}

export async function assertCommunityBackgroundSelectable(input: {
  scopeId: string;
  id: string;
  referencedIds: ReadonlySet<string>;
}) {
  const shareId = parseCommunityBackgroundId(input.id);
  const metadata = await readCommunityBackgroundMetadata(input.scopeId, shareId);
  const id = communityBackgroundId(metadata.id);
  if (metadata.withdrawnAt && !input.referencedIds.has(id)) {
    throw new Error("community background forbidden");
  }
  return id;
}

export async function getCommunityBackgroundFile(input: {
  scopeId: string;
  userId: string;
  shareId: string;
  referencedIds: ReadonlySet<string>;
}) {
  const shareId = z.string().uuid().parse(input.shareId);
  const metadata = await readCommunityBackgroundMetadata(input.scopeId, shareId);
  const id = communityBackgroundId(metadata.id);
  if (metadata.withdrawnAt && metadata.ownerUserId !== input.userId && !input.referencedIds.has(id)) {
    throw new Error("community background forbidden");
  }
  const filePath = path.join(communityBackgroundDir(input.scopeId, metadata.id), metadata.storedFileName);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new Error("community background not found");
  }
  return { stream: createReadStream(filePath), mimeType: metadata.mimeType };
}

export function communityBackgroundError(error: unknown) {
  if (error instanceof z.ZodError) {
    return { status: 400, code: 40005, message: "invalid community background" };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message === "community background forbidden") {
    return { status: 403, code: 40303, message };
  }
  if (message === "community background not found") {
    return { status: 404, code: 40401, message };
  }
  return { status: 500, code: 50001, message: "settings failed" };
}
