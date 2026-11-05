import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
const mockExportMenu = jest.fn();
jest.mock("../components/ExportMenu", () => ({
  ExportMenu: (props: unknown) => {
    mockExportMenu(props);
    return null;
  },
}));
const mockPageTitle = jest.fn();
jest.mock("../design/layout/page-title", () => ({
  ...jest.requireActual("../design/layout/page-title"),
  PageTitle: (props: unknown) => {
    mockPageTitle(props);
    return null;
  },
}));

import { MentorReports } from "../screens/mentor/mentor-reports";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { mockEndpoints, sessionFor, summary } from "./helpers/reports-fixtures";

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(sessionFor("MENTOR"));
});

describe("MentorReports", () => {
  it("renders the title and the scope subtitle on Screen, not PageTitle", async () => {
    mockEndpoints();
    renderWithProviders(<MentorReports />);
    expect(await screen.findByText("Reports")).toBeTruthy();
    expect(await screen.findByText(`Scoped to ${summary.scope.label}.`)).toBeTruthy();
    expect(mockPageTitle).not.toHaveBeenCalled();
  });

  it("never offers the workbook export to a mentor, even with a season chosen", async () => {
    mockEndpoints();
    renderWithProviders(<MentorReports />);
    await screen.findByText("Sara Student");
    const season = { id: 7, title: "Spring 2099" }; // first of the fixture scope
    fireEvent.press(screen.getByLabelText(`Season filter: ${season.title}`));
    await waitFor(() => {
      const last = mockExportMenu.mock.calls.at(-1)?.[0] as {
        seasonId: number | null;
        canExportWorkbook: boolean;
      };
      expect(last.seasonId).toBe(season.id);
      expect(last.canExportWorkbook).toBe(false);
    });
  });

  it("does not request the organisation roll-up", async () => {
    mockEndpoints();
    renderWithProviders(<MentorReports />);
    await screen.findByText("Sara Student");
    expect(get.mock.calls.some((c) => String(c[0]).includes("organisation"))).toBe(false);
  });

  it("Show more fetches the next at-risk page", async () => {
    mockEndpoints();
    renderWithProviders(<MentorReports />);
    fireEvent.press(await screen.findByText("Show more"));
    await waitFor(() => {
      expect(
        get.mock.calls.some((c) => String(c[0]).includes("/reports/engagement/students")),
      ).toBe(true);
    });
  });

  it("says so when the scope has no data", async () => {
    get.mockResolvedValue({
      data: { data: { ...summary, enrollmentCount: 0, attendanceTrend: [] } },
    });
    renderWithProviders(<MentorReports />);
    expect(await screen.findByText("No data in this scope")).toBeTruthy();
  });
});
