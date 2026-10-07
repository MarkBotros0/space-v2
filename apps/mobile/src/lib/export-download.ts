// apps/mobile/src/lib/export-download.ts
//
// expo-file-system's LEGACY API, pinned deliberately.
//
// Expo SDK 54 ships a new File/Directory API as `expo-file-system` with the
// previous one at `expo-file-system/legacy`. `createDownloadResumable` is the
// only API that gives BOTH request headers and progress callbacks, and it is
// the legacy one. A half-migrated file layer is a class of bug that only shows
// up on a real device, so the import lives here, once, and every caller goes
// through this module (spec D10).
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { XLSX_MIME, XLSX_UTI } from "@space/shared";

import { apiClient, refreshAccessToken } from "./api-client";
import { loadAccessToken } from "./token-storage";

export class ExportAuthError extends Error {
  readonly code = "invalid_token";
}

export class ExportShareUnavailableError extends Error {
  readonly code = "share_unavailable";
}

export class ExportServerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface DownloadAndShareOptions {
  /** API path, relative to the client's baseURL. */
  path: string;
  /** Local filename — also what the user sees in the share sheet and later in Files. */
  filename: string;
  dialogTitle: string;
  /** From the manifest, when there is one. Used as the progress denominator. */
  estimatedBytes?: number;
  onProgress?: (fraction: number) => void;
}

const EXPORT_DIR = `${FileSystem.cacheDirectory ?? ""}exports/`;

/**
 * Download an export and hand it to the OS share sheet.
 *
 * v1 delivers both exports as <Link>s to a GET returning
 * Content-Disposition: attachment, and the browser does the rest — credentials
 * ride on a cookie, the file lands in the OS download folder, the user opens it
 * from there. React Native has none of those three things (spec D10).
 *
 * The bytes go straight from the socket to a file: they never enter JS memory.
 * The alternative — fetching an arraybuffer and base64-encoding it to write —
 * costs roughly 1.33x the file size in heap ON TOP of the buffer itself, for a
 * students x (sessions + quizzes + assignments) matrix.
 *
 * The token travels as a header. A signed query-string URL opened in the system
 * browser would also work and is forbidden: it puts a credential in a URL.
 *
 * The cache directory is not storage — the OS may evict it. The file is a
 * courier, not a record: it is deleted once the share sheet is done and there
 * is no "previous exports" list backed by it. Android's public Downloads folder
 * is deliberately NOT a target: reaching it needs the Storage Access Framework
 * and a directory the user picks every single time, which is worse than the
 * share sheet.
 */
export async function downloadAndShare(options: DownloadAndShareOptions): Promise<void> {
  // Checked BEFORE downloading. expo-sharing is unavailable on some platforms
  // (notably web); making the user wait for a download that can only end in an
  // error is the worse failure.
  if (!(await Sharing.isAvailableAsync())) {
    throw new ExportShareUnavailableError("Sharing isn't available on this device.");
  }

  await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
  const fileUri = `${EXPORT_DIR}${options.filename}`;
  const url = `${apiClient.defaults.baseURL ?? ""}${options.path}`;

  // The URI the download actually reported, once there is one; before that the
  // path we asked for. In practice they are identical.
  let writtenUri = fileUri;
  try {
    let token = await loadAccessToken();
    let result = await run(url, fileUri, token, options);

    if (result.status === 401) {
      // The access token is 900s and a large workbook on a slow connection can
      // outlive it. One retry, exactly like the axios interceptor's `_retried`
      // discipline — a second 401 is a real permission failure.
      const fresh = await refreshAccessToken();
      if (!fresh) throw new ExportAuthError("Your session expired. Sign in again.");
      token = fresh;
      result = await run(url, fileUri, token, options);
    }

    if (result.status === 401) {
      throw new ExportAuthError("Your session expired. Sign in again.");
    }
    if (result.status < 200 || result.status >= 300) {
      // downloadResumable writes the response body whatever the status, so the
      // JSON envelope is sitting in the file. Reading it back is how the client
      // tells a 403 from a spreadsheet (spec §7). The body is a few hundred
      // bytes on every error path.
      throw await toServerError(fileUri, result.status);
    }

    writtenUri = result.uri;
    await Sharing.shareAsync(writtenUri, {
      mimeType: XLSX_MIME,
      // iOS needs the UTI as well or the sheet offers the wrong apps.
      UTI: XLSX_UTI,
      dialogTitle: options.dialogTitle,
    });
  } finally {
    await FileSystem.deleteAsync(writtenUri, { idempotent: true });
  }
}

async function run(
  url: string,
  fileUri: string,
  token: string | null,
  options: DownloadAndShareOptions,
): Promise<{ uri: string; status: number }> {
  const resumable = FileSystem.createDownloadResumable(
    url,
    fileUri,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    (progress) => {
      if (!options.onProgress) return;
      // The server streams the workbook, so there is no Content-Length and
      // totalBytesExpectedToWrite comes back as -1. The manifest's estimate is
      // the denominator in that case (spec §7).
      const expected =
        progress.totalBytesExpectedToWrite > 0
          ? progress.totalBytesExpectedToWrite
          : (options.estimatedBytes ?? 0);
      if (expected > 0) {
        options.onProgress(Math.min(1, progress.totalBytesWritten / expected));
      }
    },
  );

  const result = await resumable.downloadAsync();
  if (!result) throw new ExportServerError("download_failed", "The download didn't complete.");
  return { uri: result.uri, status: result.status };
}

async function toServerError(fileUri: string, status: number): Promise<ExportServerError> {
  try {
    const body = await FileSystem.readAsStringAsync(fileUri);
    const parsed = JSON.parse(body) as { error?: { code?: string; message?: string } };
    if (parsed.error?.code) {
      return new ExportServerError(parsed.error.code, parsed.error.message ?? "Export failed.");
    }
  } catch {
    // Not JSON, or unreadable — fall through to the status-only error.
  }
  return new ExportServerError("export_failed", `The export failed (${status}).`);
}
