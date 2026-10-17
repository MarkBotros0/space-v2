import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { code: "s7" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";
import SeasonEditScreen from "../../app/(app)/seasons/[code]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const detail = (over: Record<string, unknown> = {}) => ({
  id: 7,
  code: "s7",
  title: "TEST 2099",
  program: "TEST",
  year: 2099,
  status: "DRAFT",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  description: "Spring.",
  sessionCount: 1,
  studentCount: 4,
  absenceBudgetMinutes: 240,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [{ id: 3, name: "Group A", studentCount: 4, leaderNames: ["Lina"] }],
  ...over,
});
const sessionRow = {
  id: 12,
  title: "Kickoff",
  startsAt: "2099-03-01T18:00:00.000Z",
  dayKey: "2099-03-01",
  startTime: "20:00",
  durationMinutes: 90,
  location: null,
  recurrenceGroupId: null,
  attendanceMarked: false,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "TEST 2099",
  checkInToken: null,
  checkInOpenAt: null,
  checkInClosedAt: null,
};

function routeGets(d: ReturnType<typeof detail>) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: d } });
    if (url === "/api/v1/seasons/7/sessions")
      return Promise.resolve({ data: { data: { sessions: [sessionRow] } } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { code: "s7" };
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SeasonDetailScreen (/seasons/[code])", () => {
  it("gives SUPER edit plus the admin workspace actions, in v1's tabs", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);

    expect(await screen.findByText("TEST 2099")).toBeTruthy();
    expect(screen.getByText("Code: s7")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Jan 1, 2099 – Dec 31, 2099")).toBeTruthy();
    expect(screen.getByText("4 students across 1 groups")).toBeTruthy();
    expect(screen.getByText("Spring.")).toBeTruthy();

    fireEvent.press(screen.getByText("Edit season"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/seasons/[code]/edit",
      params: { code: "s7" },
    });
    fireEvent.press(screen.getByText("Roster"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/seasons/[code]/roster",
      params: { code: "s7" },
    });
    fireEvent.press(screen.getByText("New group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/new", params: { seasonId: "7" } });
    fireEvent.press(screen.getByText("New session"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/new", params: { seasonId: "7" } });
  });

  it("gives a season ADMIN the workspace but not the SUPER edit", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Roster")).toBeTruthy();
    expect(screen.queryByText("Edit season")).toBeNull();
    // REG-72: the admin's own edit lives here now that /season redirects a one-season admin.
    expect(screen.getByText("Save changes")).toBeTruthy();
  });

  it("is read-only when the server says the caller does not administer the season (C4)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    routeGets(detail({ canAdminister: false }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("TEST 2099")).toBeTruthy();
    expect(screen.queryByText("Roster")).toBeNull();
    expect(screen.queryByText("New session")).toBeNull();
  });

  it("lists groups and sessions under their tabs and opens them", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);

    fireEvent.press(await screen.findByText("Groups (1)"));
    expect(screen.getByText("4 students")).toBeTruthy();
    expect(screen.getByText("Leaders: Lina")).toBeTruthy();
    fireEvent.press(screen.getByText("Group A"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "3" } });

    fireEvent.press(screen.getByText("Sessions (1)"));
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.getByText("Sun, Mar 1, 2099 · 8:00 PM · 90 min")).toBeTruthy();
    fireEvent.press(screen.getByText("Kickoff"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "12" } });
    fireEvent.press(screen.getByText("Mark attendance"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/session/[id]/attendance",
      params: { id: "12" },
    });
  });

  it("shows v1's empty groups state", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail({ groups: [] }));
    renderWithProviders(<SeasonDetailScreen />);
    fireEvent.press(await screen.findByText("Groups (0)"));
    expect(screen.getByText("No groups yet")).toBeTruthy();
  });
});

describe("Duplicate season (SUPER, on the detail)", () => {
  it("opens next year with dates one year on and the code to match, then opens the copy (REG-70)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(
      detail({
        year: 2026,
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
      }),
    );
    post.mockResolvedValue({ data: { data: { id: 99, code: "test-2028" } } });
    renderWithProviders(<SeasonDetailScreen />);

    fireEvent.press(await screen.findByText("Duplicate"));
    expect(await screen.findByText("Duplicate TEST 2026")).toBeTruthy();
    expect(screen.getByLabelText("Year").props.value).toBe("2027");
    expect(screen.getByLabelText("Code").props.value).toBe("test-2027");
    fireEvent.changeText(screen.getByLabelText("Year"), "2028");
    expect(screen.getByLabelText("Code").props.value).toBe("test-2028");
    fireEvent.press(screen.getByText("Duplicate season"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/duplicate", {
        year: 2028,
        code: "test-2028",
        startDate: "2027-01-01T00:00:00.000Z",
        endDate: "2027-12-31T00:00:00.000Z",
      }),
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/seasons/[code]",
        params: { code: "test-2028" },
      }),
    );
  });

  it("is not offered to an ADMIN", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("TEST 2099");
    expect(screen.queryByText("Duplicate")).toBeNull();
  });
});

describe("SeasonEditScreen (/seasons/[code]/edit) — SUPER only", () => {
  it("saves identity AND status through the full-body PATCH, keeping the stored budgets, and follows a code change", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    patch.mockResolvedValue({ data: { data: { id: 7, code: "gbv-2099" } } });
    renderWithProviders(<SeasonEditScreen />);

    await screen.findByLabelText("Code");
    fireEvent.changeText(screen.getByLabelText("Code"), "GBV 2099");
    fireEvent.press(screen.getByLabelText("Status"));
    fireEvent.press(await screen.findByText("Active"));
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/seasons/7", {
        code: "GBV 2099",
        program: "TEST",
        year: 2099,
        description: "Spring.",
        startDate: "2099-01-01T00:00:00.000Z",
        endDate: "2099-12-31T00:00:00.000Z",
        status: "ACTIVE",
        absenceBudgetMinutes: 240,
        absenceWeightMinutes: 90,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/seasons/[code]",
      params: { code: "gbv-2099" },
    });
  });

  it("previews the slug and blocks an invalid code client-side with the server's own schema", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonEditScreen />);
    await screen.findByLabelText("Code");
    fireEvent.changeText(screen.getByLabelText("Code"), "x");
    fireEvent.press(screen.getByText("Save changes"));
    expect(screen.getByLabelText("Code").props.accessibilityHint).toMatch(/2–40/);
    expect(patch).not.toHaveBeenCalled();
  });

  it("deletes behind v1's confirm dialog and shows season_in_use verbatim", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    del.mockRejectedValueOnce(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            error: {
              code: "season_in_use",
              message: "This season has sessions or enrollments; archive it instead.",
            },
          },
        },
      }),
    );
    renderWithProviders(<SeasonEditScreen />);
    fireEvent.press(await screen.findByText("Delete season"));
    expect(await screen.findByText('Delete "TEST 2099"?')).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Delete"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/7"));
    expect(
      await screen.findByText("This season has sessions or enrollments; archive it instead."),
    ).toBeTruthy();

    del.mockResolvedValueOnce({ data: { data: { deleted: true } } });
    fireEvent.press(screen.getByText("Delete season"));
    fireEvent.press(await screen.findByText("Delete"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/seasons"));
  });

  it("refuses a non-SUPER without fetching", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<SeasonEditScreen />);
    expect(
      await screen.findByText("Only a super admin can edit a season's identity."),
    ).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
