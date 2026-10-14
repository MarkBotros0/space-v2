import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "../../..");
export const V1_SOURCE_DIR = path.join(os.homedir(), "projects/JPC/jpc-space");
export const REF_ROOT = path.join(os.homedir(), "projects/JPC/.v1-reference");
export const APP_DIR = path.join(REF_ROOT, "app");
export const SHOTS_DIR = path.join(REF_ROOT, "shots");
export const USERS_FILE = path.join(REF_ROOT, "users.json");
export const MANIFEST_FILE = path.join(REF_ROOT, "manifest.json");
export const BRANCH_URL_FILE = path.join(os.homedir(), ".secrets/jpc-v1-reference-db-url");
export const V1_BASE_URL = "http://localhost:3100";
export const UI_REBUILD_DOCS = path.join(REPO_ROOT, "docs/superpowers/ui-rebuild");
