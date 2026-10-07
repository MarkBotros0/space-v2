// apps/mobile/src/__tests__/export-menu.test.tsx
const mockDownloadAndShare = jest.fn();
// Lazy wrapper — see export-download.test.ts for the temporal-dead-zone reason.
jest.mock("../lib/export-download", () => ({
  downloadAndShare: (...a: unknown[]) => mockDownloadAndShare(...a),
  ExportShareUnavailableError: class extends Error {},
}));
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), defaults: { baseURL: "http://localhost:4000" } },
}));

import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { apiClient } from "../lib/api-client";
import { ExportMenu } from "../components/ExportMenu";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;

const manifest = {
  filename: "gbv-2026-attendance-grades-2026-08-24.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  sheets: [
    { name: "Attendance", columnCount: 8, rowCount: 38 },
    { name: "Grades", columnCount: 6, rowCount: 38 },
    { name: "Assignments", columnCount: 7, rowCount: 38 },
    { name: "Key", columnCount: 2, rowCount: 13 },
  ],
  estimatedBytes: 40960,
  generatedAt: "2026-08-24T00:00:00.000Z",
  scopeDescription: "GBV 2026 (gbv-2026)",
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { data: manifest } });
  mockDownloadAndShare.mockResolvedValue(undefined);
});

describe("ExportMenu", () => {
  it("offers the engagement export in every scope", async () => {
    renderWithProviders(
      <ExportMenu
        seasonId={null}
        scopeLabel="All seasons"
        canExportWorkbook={false}
        exportDay="2026-08-24"
      />,
    );
    fireEvent.press(await screen.findByText("Export engagement"));

    await waitFor(() =>
      expect(mockDownloadAndShare).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/v1/reports/engagement/export",
          // Exactly the server's org day, not whatever day the test machine is on.
          filename: "engagement-all-seasons-2026-08-24.xlsx",
        }),
      ),
    );
  });

  it("hides the workbook button when the caller may not take one", async () => {
    renderWithProviders(
      <ExportMenu
        seasonId={null}
        scopeLabel="All seasons"
        canExportWorkbook={false}
        exportDay="2026-08-24"
      />,
    );
    expect(await screen.findByText("Export engagement")).toBeTruthy();
    // v1's ONLY mentor protection was a button that was never rendered (R86).
    // Hiding it here is courtesy; the endpoint refuses regardless, and the
    // integration suite proves that.
    expect(screen.queryByText("Export season workbook")).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows the manifest's size before a workbook download", async () => {
    renderWithProviders(
      <ExportMenu seasonId={7} scopeLabel="GBV 2026" canExportWorkbook exportDay="2026-08-24" />,
    );
    expect(await screen.findByText("Export season workbook (~40 KB)")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/exports/manifest");
  });

  it("uses the manifest's filename verbatim so the share sheet and the header agree", async () => {
    renderWithProviders(<ExportMenu seasonId={7} scopeLabel="GBV 2026" canExportWorkbook exportDay="2026-08-24" />);
    fireEvent.press(await screen.findByText("Export season workbook (~40 KB)"));

    await waitFor(() =>
      expect(mockDownloadAndShare).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/v1/seasons/7/exports/workbook",
          filename: manifest.filename,
          estimatedBytes: 40960,
        }),
      ),
    );
  });

  it("surfaces a failure as text rather than swallowing it", async () => {
    mockDownloadAndShare.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "forbidden" }),
    );
    renderWithProviders(
      <ExportMenu
        seasonId={null}
        scopeLabel="All seasons"
        canExportWorkbook={false}
        exportDay="2026-08-24"
      />,
    );
    fireEvent.press(await screen.findByText("Export engagement"));

    expect(await screen.findByText("Couldn't export. You don't have access to this.")).toBeTruthy();
  });
});
