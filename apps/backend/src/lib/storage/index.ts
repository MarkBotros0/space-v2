import { LocalFsStorage } from "./local";
import type { Storage } from "./types";

export { buildStorageKey, FileNotFoundError, type PutMeta, type PutResult, type Storage } from "./types";

let cached: Storage | undefined;

export function getStorage(): Storage {
  if (cached) return cached;
  cached = new LocalFsStorage();
  return cached;
}
