// apps/mobile/src/__tests__/export-download.test.ts
const mockDownloadAsync = jest.fn();
// `(..._args: unknown[])` so `mock.calls[0]` is typed as an argument list, not
// `[]` — the tests below destructure it and index `[3]`, which fails typecheck
// against a zero-parameter mock.
const mockCreateDownloadResumable = jest.fn((..._args: unknown[]) => ({
  downloadAsync: mockDownloadAsync,
}));
const mockDeleteAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockLoadAccessToken = jest.fn();
const mockRefreshAccessToken = jest.fn();

// Every factory wraps its mock in an arrow instead of referencing it directly.
// babel-jest hoists jest.mock above the `const mock… = jest.fn()` lines and the
// ES imports below compile to requires that run first, so a factory that READS
// a mock const at evaluation time hits the temporal dead zone ("Cannot access
// 'mockCreateDownloadResumable' before initialization"). The arrow defers the
// read to call time, when the const exists.
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  createDownloadResumable: (...a: unknown[]) => mockCreateDownloadResumable(...a),
  deleteAsync: (...a: unknown[]) => mockDeleteAsync(...a),
  makeDirectoryAsync: (...a: unknown[]) => mockMakeDirectoryAsync(...a),
  readAsStringAsync: (...a: unknown[]) => mockReadAsStringAsync(...a),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: (...a: unknown[]) => mockIsAvailableAsync(...a),
  shareAsync: (...a: unknown[]) => mockShareAsync(...a),
}));
jest.mock("../lib/token-storage", () => ({
  loadAccessToken: (...a: unknown[]) => mockLoadAccessToken(...a),
}));
jest.mock("../lib/api-client", () => ({
  apiClient: { defaults: { baseURL: "http://localhost:4000" } },
  refreshAccessToken: (...a: unknown[]) => mockRefreshAccessToken(...a),
}));

import {
  ExportAuthError,
  ExportServerError,
  ExportShareUnavailableError,
  downloadAndShare,
} from "../lib/export-download";

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadAccessToken.mockResolvedValue("access-token");
  mockIsAvailableAsync.mockResolvedValue(true);
  mockDownloadAsync.mockResolvedValue({ uri: "file:///cache/exports/x.xlsx", status: 200 });
});

describe("downloadAndShare", () => {
  it("writes the body straight to disk with the token in a HEADER", async () => {
    await downloadAndShare({
      path: "/api/v1/seasons/7/exports/workbook",
      filename: "gbv-2026-attendance-grades-2026-08-24.xlsx",
      dialogTitle: "GBV 2026",
    });

    const [url, fileUri, options] = mockCreateDownloadResumable.mock.calls[0]!;
    expect(url).toBe("http://localhost:4000/api/v1/seasons/7/exports/workbook");
    expect(fileUri).toBe("file:///cache/exports/gbv-2026-attendance-grades-2026-08-24.xlsx");
    // A signed query-string URL handed to the system browser would work and is
    // forbidden: it puts a credential in a URL (spec D10).
    expect(url).not.toContain("token");
    expect((options as { headers: Record<string, string> }).headers.Authorization).toBe(
      "Bearer access-token",
    );
  });

  it("never fetches the body into JS memory or base64-encodes it", async () => {
    const fetchSpy = jest.spyOn(global, "fetch" as never);
    await downloadAndShare({
      path: "/api/v1/reports/engagement/export",
      filename: "engagement-all-seasons-2026-08-24.xlsx",
      dialogTitle: "All seasons",
    });
    // THE test the roadmap names. Fetching an arraybuffer and base64-encoding
    // it to write costs ~1.33x the file size in JS heap on top of the buffer
    // itself, for a students x (sessions + quizzes + assignments) matrix.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCreateDownloadResumable).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("hands the file to the share sheet with a mimeType AND a UTI", async () => {
    await downloadAndShare({
      path: "/api/v1/reports/engagement/export",
      filename: "engagement-all-seasons-2026-08-24.xlsx",
      dialogTitle: "All seasons",
    });

    expect(mockShareAsync).toHaveBeenCalledWith("file:///cache/exports/x.xlsx", {
      // iOS needs the UTI or the sheet offers the wrong apps, or refuses the
      // file outright (spec D10).
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      UTI: "org.openxmlformats.spreadsheetml.sheet",
      dialogTitle: "All seasons",
    });
  });

  it("deletes the cached file after sharing — it is a courier, not a record", async () => {
    await downloadAndShare({
      path: "/api/v1/reports/engagement/export",
      filename: "engagement-all-seasons-2026-08-24.xlsx",
      dialogTitle: "All seasons",
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith("file:///cache/exports/x.xlsx", {
      idempotent: true,
    });
  });

  it("deletes the cached file even when the share sheet throws", async () => {
    mockShareAsync.mockRejectedValueOnce(new Error("user cancelled"));
    await expect(
      downloadAndShare({
        path: "/api/v1/reports/engagement/export",
        filename: "x.xlsx",
        dialogTitle: "All seasons",
      }),
    ).rejects.toThrow();
    expect(mockDeleteAsync).toHaveBeenCalled();
  });

  it("refreshes once on a 401 and retries — the access token is 900s", async () => {
    mockDownloadAsync
      .mockResolvedValueOnce({ uri: "file:///cache/exports/x.xlsx", status: 401 })
      .mockResolvedValueOnce({ uri: "file:///cache/exports/x.xlsx", status: 200 });
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({ error: { code: "invalid_token", message: "expired" } }),
    );
    mockRefreshAccessToken.mockResolvedValue("fresh-token");

    await downloadAndShare({
      path: "/api/v1/reports/engagement/export",
      filename: "x.xlsx",
      dialogTitle: "All seasons",
    });

    // A large workbook on a slow connection can outlive the token; a mid-flight
    // 401 is retryable, not a permission failure (spec D10).
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockDownloadAsync).toHaveBeenCalledTimes(2);
    expect(mockShareAsync).toHaveBeenCalled();
  });

  it("gives up after ONE refresh, exactly like the axios interceptor", async () => {
    mockDownloadAsync.mockResolvedValue({ uri: "file:///cache/exports/x.xlsx", status: 401 });
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({ error: { code: "invalid_token", message: "expired" } }),
    );
    mockRefreshAccessToken.mockResolvedValue("fresh-token");

    await expect(
      downloadAndShare({ path: "/x", filename: "x.xlsx", dialogTitle: "s" }),
    ).rejects.toBeInstanceOf(ExportAuthError);
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server's error code from the written body on a 403", async () => {
    mockDownloadAsync.mockResolvedValue({ uri: "file:///cache/exports/x.xlsx", status: 403 });
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({ error: { code: "forbidden", message: "You don't have access to this." } }),
    );

    // downloadResumable writes the body whatever the status, so the JSON
    // envelope lands in the file. Reading it back is how the client tells a 403
    // from a spreadsheet (spec §7).
    await expect(
      downloadAndShare({ path: "/x", filename: "x.xlsx", dialogTitle: "s" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(mockDeleteAsync).toHaveBeenCalled();
  });

  it("reports a rate limit as itself rather than as a generic failure", async () => {
    mockDownloadAsync.mockResolvedValue({ uri: "file:///cache/exports/x.xlsx", status: 429 });
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({ error: { code: "too_many_requests", message: "Too many requests." } }),
    );
    await expect(
      downloadAndShare({ path: "/x", filename: "x.xlsx", dialogTitle: "s" }),
    ).rejects.toBeInstanceOf(ExportServerError);
  });

  it("refuses to start when sharing is unavailable, rather than downloading first", async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    await expect(
      downloadAndShare({ path: "/x", filename: "x.xlsx", dialogTitle: "s" }),
    ).rejects.toBeInstanceOf(ExportShareUnavailableError);
    // expo-sharing is not available on every platform (notably web). Checking
    // first means the user is not made to wait for a download that can only end
    // in an error (spec D10).
    expect(mockCreateDownloadResumable).not.toHaveBeenCalled();
  });

  it("reports progress against the manifest's estimate when one is given", async () => {
    const onProgress = jest.fn();
    await downloadAndShare({
      path: "/x",
      filename: "x.xlsx",
      dialogTitle: "s",
      estimatedBytes: 1000,
      onProgress,
    });
    const callback = mockCreateDownloadResumable.mock.calls[0]![3] as (p: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void;
    // A plain downloadAsync gives no progress at all; downloadResumable does,
    // and the manifest supplies the denominator when the server sends no
    // Content-Length (spec D10).
    callback({ totalBytesWritten: 500, totalBytesExpectedToWrite: -1 });
    expect(onProgress).toHaveBeenCalledWith(0.5);
  });
});
