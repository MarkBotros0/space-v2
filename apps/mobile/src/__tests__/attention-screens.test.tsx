import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { seasonFixture, serveStaff, sessionRow, staffRoutes } from "./helpers/staff-today-fixtures";
import AttentionSessionsScreen from "../../app/(app)/attention/sessions";
import AttentionAtRiskScreen from "../../app/(app)/attention/at-risk";

const get = apiClient.get as jest.Mock;
const ok = (data: unknown) => Promise.resolve({ data: { data } });
const scope = { seasonIds: [], seasons: [], truncated: false, label: "x" };

function riskRow(id: number, name: string, over: Record<string, unknown> = {}) {
  return {
    score: 40, attendancePct: 50, submissionPct: 33, attendanceTotal: 4, attendancePresent: 2,
    submissionsExpected: 3, submissionsCompleted: 1, studentUserId: id, name,
    email: `${name}@x.test`, seasonId: 7, seasonTitle: "Season 7", band: "AT_RISK", ...over,
  };
}
const riskPage = (rows: unknown[], total: number, nextCursor: string | null = null) => ({ scope, rows, nextCursor, total });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
});

describe("Sessions with no attendance", () => {
  it("lists the sessions Today counted and opens attendance", async () => {
    serveStaff(get);
    renderWithProviders(<AttentionSessionsScreen />);

    expect(await screen.findByText("Week 1")).toBeTruthy();
    // Only the unmarked one (id 1); id 2 is marked.
    expect(screen.queryByText("Week 2")).toBeNull();
    fireEvent.press(screen.getByText("Week 1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/attendance", params: { id: "1" } });
  });

  it("with a valid seasonId reads only that season; a non-numeric one is ignored", async () => {
    mockParams = { seasonId: "9" };
    serveStaff(get, {
      table: staffRoutes({
        "/api/v1/seasons/9/sessions": { sessions: [sessionRow(5, 9, 600)] },
      }),
    });
    const first = renderWithProviders(<AttentionSessionsScreen />);
    expect(await screen.findByText("Week 5")).toBeTruthy();
    expect(screen.queryByText("Week 1")).toBeNull();
    first.unmount();

    mockParams = { seasonId: "abc" };
    renderWithProviders(<AttentionSessionsScreen />);
    expect(await screen.findByText("Week 1")).toBeTruthy();
  });

  it("SUPER with several active seasons gets one list per season", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    serveStaff(get, {
      table: staffRoutes({
        "/api/v1/seasons": { seasons: [seasonFixture(7), seasonFixture(8)] },
        "/api/v1/seasons/8/sessions": { sessions: [sessionRow(3, 8, 600)] },
      }),
    });
    renderWithProviders(<AttentionSessionsScreen />);
    expect(await screen.findByText("Week 3")).toBeTruthy();
    expect(screen.getByText("Week 1")).toBeTruthy();
    expect(screen.getByText("SEASON 7")).toBeTruthy();
    expect(screen.getByText("SEASON 8")).toBeTruthy();
  });

  it("shows an empty state, and a retry when a read failed", async () => {
    serveStaff(get, { table: staffRoutes({ "/api/v1/seasons/7/sessions": { sessions: [sessionRow(2, 7, 700, true)] } }) });
    const first = renderWithProviders(<AttentionSessionsScreen />);
    expect(await screen.findByText("Nothing to mark")).toBeTruthy();
    first.unmount();

    serveStaff(get, { table: staffRoutes({ "/api/v1/seasons/7/sessions": new Error("boom") }) });
    renderWithProviders(<AttentionSessionsScreen />);
    expect(await screen.findByText("Try again")).toBeTruthy();
  });

  it("STUDENT sees not available", () => {
    useSessionStore.setState(makeSession("STUDENT"));
    renderWithProviders(<AttentionSessionsScreen />);
    expect(screen.getByText("This screen isn't available for your role.")).toBeTruthy();
  });
});

describe("Students at risk", () => {
  it("lists at-risk students with attendance and submissions, opens the student, loads more", async () => {
    mockParams = { seasonId: "7" };
    get
      .mockResolvedValueOnce({ data: { data: riskPage([riskRow(21, "Sara")], 2, "c1") } })
      .mockResolvedValueOnce({ data: { data: riskPage([riskRow(22, "Omar")], 2) } });
    renderWithProviders(<AttentionAtRiskScreen />);

    expect(await screen.findByText("Sara")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/reports/engagement/students?seasonId=7&band=AT_RISK&limit=50");
    expect(screen.getByText("50% attendance · 1/3 submitted")).toBeTruthy();
    fireEvent.press(screen.getByText("Sara"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });

    fireEvent.press(screen.getByText("Load more"));
    expect(await screen.findByText("Omar")).toBeTruthy();
    expect(screen.queryByText("Load more")).toBeNull();
  });

  it("ignores a non-numeric seasonId and allows SUPER", async () => {
    mockParams = { seasonId: "abc" };
    useSessionStore.setState(makeSession("SUPER"));
    get.mockImplementation(() => ok(riskPage([riskRow(21, "Sara")], 1)));
    renderWithProviders(<AttentionAtRiskScreen />);
    expect(await screen.findByText("Sara")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/reports/engagement/students?band=AT_RISK&limit=50");
  });

  it("empty and error states; STUDENT sees not available", async () => {
    get.mockImplementation(() => ok(riskPage([], 0)));
    const first = renderWithProviders(<AttentionAtRiskScreen />);
    expect(await screen.findByText("No students at risk")).toBeTruthy();
    first.unmount();

    get.mockRejectedValue(new Error("boom"));
    const second = renderWithProviders(<AttentionAtRiskScreen />);
    expect(await screen.findByText("Try again")).toBeTruthy();
    second.unmount();

    useSessionStore.setState(makeSession("STUDENT"));
    renderWithProviders(<AttentionAtRiskScreen />);
    expect(screen.getByText("This screen isn't available for your role.")).toBeTruthy();
  });
});
