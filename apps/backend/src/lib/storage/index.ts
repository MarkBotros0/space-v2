import type { Readable } from "node:stream";

import { config } from "../config";

import { LocalFsStorage } from "./local";
import { S3Storage } from "./s3";

export interface PutMeta {
  mime: string;
}

export interface PutResult {
  path: string;
}

/**
 * Trimmed from v1's interface: url() is omitted because nothing serves a
 * redirect or a signed link — callers stream bytes through
 * GET /api/v1/submissions/:publicId/files/:fileId instead. Add it if and when
 * an S3 deployment wants presigned URLs.
 *
 * get() rejects with FileNotFoundError when the blob is absent, so a dangling
 * database row surfaces as a 404 rather than an unhandled stream error.
 */
export interface Storage {
  put(key: string, data: Buffer, meta: PutMeta): Promise<PutResult>;
  get(path: string): Promise<Readable>;
  delete(path: string): Promise<void>;
}

/** Thrown by Storage.get() when the blob is missing or escapes the root. */
export class FileNotFoundError extends Error {
  constructor(message = "File not found in storage") {
    super(message);
    this.name = "FileNotFoundError";
  }
}

let cached: Storage | undefined;

export function getStorage(): Storage {
  if (cached) return cached;
  cached = config.storageDriver === "s3" ? new S3Storage() : new LocalFsStorage();
  return cached;
}

export function buildStorageKey(parts: {
  bucket: string;
  publicId: string;
  originalName: string;
  date?: Date;
}): string {
  const d = parts.date ?? new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  // Anything outside [A-Za-z0-9._-] collapses to "_", so a filename carrying
  // path separators cannot escape the bucket/date prefix.
  const safeName = parts.originalName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return `${parts.bucket}/${yyyy}/${mm}/${parts.publicId}-${safeName}`;
}
