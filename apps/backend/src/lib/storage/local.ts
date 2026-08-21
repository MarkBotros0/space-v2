import { createReadStream } from "node:fs";
import type { Stats } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

import { config } from "../config";

import { FileNotFoundError, type PutMeta, type PutResult, type Storage } from "./index";

export class LocalFsStorage implements Storage {
  private readonly root: string;

  constructor(root?: string) {
    this.root = path.resolve(root ?? config.localUploadsDir);
  }

  /**
   * Join a caller-supplied storage path to the root and prove the result stays
   * inside it.
   *
   * Every storagePath in the database today was written by buildStorageKey,
   * which collapses anything outside [A-Za-z0-9._-] to "_" — so no separator
   * survives and none of these can traverse. This check is defence in depth:
   * one future code path that writes an unsanitised storagePath should not
   * turn a download route into arbitrary file read.
   */
  private resolveWithinRoot(storagePath: string): string {
    const fullPath = path.resolve(this.root, storagePath);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (fullPath !== this.root && !fullPath.startsWith(rootWithSep)) {
      throw new FileNotFoundError("Resolved path escapes the storage root");
    }
    return fullPath;
  }

  async put(key: string, data: Buffer, _meta: PutMeta): Promise<PutResult> {
    const fullPath = this.resolveWithinRoot(key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return { path: key };
  }

  /**
   * Rejects with FileNotFoundError rather than resolving a stream that errors
   * later: the route needs to decide between 404 and 200 *before* it starts
   * writing a response body, and a stream that fails after headers are sent
   * cannot be turned back into a clean error envelope.
   */
  async get(storagePath: string): Promise<Readable> {
    const fullPath = this.resolveWithinRoot(storagePath);
    const stats = await stat(fullPath).catch((err: NodeJS.ErrnoException): Stats | null => {
      if (err.code === "ENOENT" || err.code === "ENOTDIR") return null;
      throw err;
    });
    if (!stats?.isFile()) throw new FileNotFoundError();
    return createReadStream(fullPath);
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = this.resolveWithinRoot(storagePath);
    await unlink(fullPath).catch((err: NodeJS.ErrnoException) => {
      // Deleting an already-absent file is the desired end state, not an error.
      if (err.code !== "ENOENT") throw err;
    });
  }
}
