import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
let mockParams: Record<string, string> = { code: "s7" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, dismissTo: mockDismissTo, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

import { detail, routeGets, student } from "./helpers/season-detail-fixtures";

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { code: "s7" };
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SeasonDetailScreen (/seasons/[code])", () => {
  it("shows the season at a glance and its figures", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);

    expect(await screen.findByText("TEST 2099")).toBeTruthy();
    expect(screen.getByText("Code: s7")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Jan 1, 2099 – Dec 31, 2099")).toBeTruthy();
    expect(screen.getByLabelText("4 students")).toBeTruthy();
    expect(screen.getByLabelText("1 group")).toBeTruthy();
    expect(screen.getByLabelText("1 session")).toBeTruthy();
    expect(screen.getByText("Spring.")).toBeTruthy();
    expect(screen.queryByText("Overview")).toBeNull();
  });

  // Owner 2026-11-07: admins, groups and students as one card, a hierarchy.
  it("shows a SUPER one People card: admins, then groups with leaders, then their students", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);

    const card = await screen.findByTestId("people-card");
    expect(card).toBeTruthy();
    expect(await screen.findByText("Pat Admin")).toBeTruthy();
    expect(screen.getByText("Groups (1)")).toBeTruthy();
    expect(screen.getByText("Leader: Lina")).toBeTruthy();
    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Omar Odeh")).toBeTruthy();
    expect(screen.getByText("Not in a group (1)")).toBeTruthy();
    expect(screen.getByText("Nadia Nour")).toBeTruthy();
    // No separate Groups or Admins sections under it any more.
    expect(screen.queryByText("GROUPS (1)")).toBeNull();
    expect(screen.queryByText("ADMINS")).toBeNull();

    fireEvent.press(screen.getByLabelText("Manage admins"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/admins", params: { code: "s7" } });
    fireEvent.press(screen.getByRole("button", { name: /^Group A,/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "3" } });
    fireEvent.press(screen.getByText("New group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/new", params: { seasonId: "7" } });
    fireEvent.press(screen.getByText("Move students between groups"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/roster", params: { code: "s7" } });
  });

  it("caps a group's students and says how many more", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const many = Array.from({ length: 9 }, (_, i) => student(100 + i, `Student ${i + 1}`, 3));
    routeGets(detail());
    const base = get.getMockImplementation()!;
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons/7/roster" ? Promise.resolve({ data: { data: { roster: many } } }) : base(url),
    );
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Student 6")).toBeTruthy();
    expect(screen.queryByText("Student 7")).toBeNull();
    expect(screen.getByText("+3 more")).toBeTruthy();
    expect(screen.queryByText(/^Not in a group/)).toBeNull();
  });

  it("gives a SUPER Sessions, Assignments and Quizzes tiles for this season, and Edit and Duplicate as header buttons", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByTestId("season-actions");
    for (const label of ["Sessions", "Assignments", "Quizzes", "Add people"])
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    // Each card names what it opens, without "Manage" (owner, 2026-11-07).
    for (const gone of ["New session", "Students and groups", "Manage quizzes", "Manage assignments", "Manage sessions"])
      expect(screen.queryByText(gone)).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Sessions" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/sessions", params: { code: "s7" } });
    fireEvent.press(screen.getByRole("button", { name: "Assignments" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignments", params: { seasonId: "7" } });
    fireEvent.press(screen.getByRole("button", { name: "Quizzes" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quizzes", params: { seasonId: "7" } });

    fireEvent.press(screen.getByLabelText("Edit season"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/edit", params: { code: "s7" } });
    expect(screen.getByLabelText("Duplicate season")).toBeTruthy();
    // The sessions list itself is a screen of its own now.
    expect(screen.queryByText("Kickoff")).toBeNull();
  });

  it("gives a season ADMIN the workspace and their settings, but no admins, Edit or Duplicate", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Sara Student")).toBeTruthy();
    for (const label of ["Sessions", "Assignments", "Quizzes"])
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    expect(screen.getByText("New group")).toBeTruthy();
    expect(screen.queryByText("Admins")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/admins");
    expect(screen.queryByLabelText("Edit season")).toBeNull();
    expect(screen.queryByLabelText("Duplicate season")).toBeNull();
    // REG-72: the admin's own edit lives here.
    expect(screen.getByText("Save changes")).toBeTruthy();
  });

  it("is read-only when the server says the caller does not administer the season (C4)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    routeGets(detail({ canAdminister: false }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Group A")).toBeTruthy();
    // Counts only: the roster is the season admins' to read.
    expect(screen.getByText("4 students")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/roster");
    expect(screen.getByRole("button", { name: "Sessions" })).toBeTruthy();
    for (const label of ["Assignments", "Quizzes", "New group", "Move students between groups", "Add people"])
      expect(screen.queryByText(label)).toBeNull();
  });

  it("shows a mentor the season and its people, with nothing to change", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    routeGets(detail({ canAdminister: false }));
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("TEST 2099");
    for (const label of ["Assignments", "Quizzes", "New group", "Add people", "Save changes"])
      expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByLabelText("Edit season")).toBeNull();
  });

  it("pluralises: no leader yet, two leaders, one student", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    routeGets(
      detail({
        canAdminister: false,
        studentCount: 3,
        groups: [
          { id: 3, name: "Group A", studentCount: 2, leaderNames: [] },
          { id: 4, name: "Group B", studentCount: 1, leaderNames: ["Omar", "Lina"] },
        ],
      }),
    );
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByLabelText("3 students")).toBeTruthy();
    expect(screen.getByLabelText("2 groups")).toBeTruthy();
    expect(screen.getByText("Groups (2)")).toBeTruthy();
    expect(screen.getByText("No leader yet")).toBeTruthy();
    expect(screen.getByText("Leaders: Omar, Lina")).toBeTruthy();
    expect(screen.getByText("1 student")).toBeTruthy();
  });

  // Owner 2026-11-07: a finished season is read, never changed; Duplicate starts a draft.
  it.each(["COMPLETED", "ARCHIVED"])("shows a SUPER a %s season read-only, with Duplicate and Results", async (status) => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail({ status }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Pat Admin")).toBeTruthy();
    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Leader: Lina")).toBeTruthy();
    for (const label of ["New group", "Move students between groups", "Assignments", "Quizzes", "Add people", "End season"])
      expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByLabelText("Manage admins")).toBeNull();
    expect(screen.getByRole("button", { name: "Sessions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Results" })).toBeTruthy();
    expect(screen.getByText("This season has finished")).toBeTruthy();
    fireEvent.press(screen.getByText("Duplicate as a draft"));
    expect(await screen.findByLabelText("Year")).toBeTruthy();
  });

  it("says so when the code param is missing", async () => {
    mockParams = {};
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Not found")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("says there are no groups yet when the season has none", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail({ groups: [] }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("No groups yet.")).toBeTruthy();
    expect(screen.getByText("Groups (0)")).toBeTruthy();
    expect(screen.queryByText("Move students between groups")).toBeNull();
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

    fireEvent.press(await screen.findByLabelText("Duplicate season"));
    expect(await screen.findByText("Duplicate TEST 2026")).toBeTruthy();
    expect(screen.getByLabelText("Year").props.value).toBe("2027");
    expect(screen.getByLabelText("Code").props.value).toBe("test-2027");
    fireEvent.changeText(screen.getByLabelText("Year"), "2028");
    expect(screen.getByLabelText("Code").props.value).toBe("test-2028");
    fireEvent.press(screen.getByText("Duplicate"));

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

  it("starts from the defaults again after the sheet is closed and reopened", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail({ year: 2026 }));
    renderWithProviders(<SeasonDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Duplicate season"));
    fireEvent.changeText(await screen.findByLabelText("Year"), "2030");
    fireEvent.changeText(screen.getByLabelText("Code"), "custom");
    fireEvent.press(screen.getByTestId("sheet-backdrop"));
    // The close reset the fields; reopening shows the defaults.
    fireEvent.press(screen.getByLabelText("Duplicate season"));
    expect((await screen.findByLabelText("Year")).props.value).toBe("2027");
    expect(screen.getByLabelText("Code").props.value).toBe("test-2027");
  });

  it("is not offered to an ADMIN", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("TEST 2099");
    expect(screen.queryByLabelText("Duplicate season")).toBeNull();
  });
});
