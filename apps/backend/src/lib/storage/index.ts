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
 * Trimmed from v1's interface: get() and url() are omitted because nothing in
 * the /api/v1 surface reads a file back — that is /api/uploads/[...path], which
 * this port does not cover. They land with the download route.
 */
export interface Storage {
  put(key: string, data: Buffer, meta: PutMeta): Promise<PutResult>;
  delete(path: string): Promise<void>;
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
