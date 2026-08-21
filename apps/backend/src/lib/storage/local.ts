import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config";

import type { PutMeta, PutResult, Storage } from "./index";

export class LocalFsStorage implements Storage {
  private readonly root: string;

  constructor(root?: string) {
    this.root = path.resolve(root ?? config.localUploadsDir);
  }

  async put(key: string, data: Buffer, _meta: PutMeta): Promise<PutResult> {
    const fullPath = path.join(this.root, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return { path: key };
  }

  async delete(storagePath: string): Promise<void> {
    await unlink(path.join(this.root, storagePath)).catch((err: NodeJS.ErrnoException) => {
      // Deleting an already-absent file is the desired end state, not an error.
      if (err.code !== "ENOENT") throw err;
    });
  }
}
