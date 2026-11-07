import { ScrollView, StyleSheet } from "react-native";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import StudentsScreen from "../../app/(app)/(tabs)/students/index";

const get = apiClient.get as jest.Mock;

const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
const superSession = {
  user: { id: 1, name: "Test super", email: "sup@jpc.test", role: "SUPER" as const, avatarPath: null, hasPassword: true },
  scopes: emptyScopes,
};
const mentorSession = {
  user: { id: 2, name: "Test mentor", email: "men@jpc.test", role: "MENTOR" as const, avatarPath: null, hasPassword: true },
  scopes: emptyScopes,
};
const studentSession = {
  user: { id: 9, name: "Test student", email: "stu@jpc.test", role: "STUDENT" as const, avatarPath: null, hasPassword: true },
  scopes: { ...emptyScopes, activeSeasonId: 7 },
};

const activeRow = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  university: "Cairo University",
  faculty: "Engineering",
  universityGraduationYear: 2027,
  graduationYear: null,
  activeSeasonTitle: "Spring 2099",
  currentGroupName: "Group A",
  droppedEnrollment: null,
};

const page = (students: unknown[], nextCursor: number | null = null, total = students.length) => ({
  data: { data: { students, nextCursor, total } },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("StudentsScreen (active)", () => {
  it("lists students with the season/group line and the real total", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));

    renderWithProviders(<StudentsScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText(/Spring 2099/)).toBeTruthy();
    expect(screen.getByText("1 student in your seasons")).toBeTruthy();
    expect(screen.getByText("Spring 2099 · Group A · Cairo University")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=active");
  });

  it("navigates to the detail route on press", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));

    renderWithProviders(<StudentsScreen />);
    fireEvent.press(await screen.findByLabelText(/^Sara Student, /));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/student/[id]",
      params: { id: "21" },
    });
  });

  it("shows the role gate for a STUDENT without calling the API", async () => {
    useSessionStore.setState(studentSession);

    renderWithProviders(<StudentsScreen />);

    expect(await screen.findByText(/isn't available for your role/)).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("submits a search and refetches with q", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));

    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");

    const input = screen.getByLabelText("Search students");
    fireEvent.changeText(input, "sara");
    fireEvent(input, "submitEditing");

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&q=sara"),
    );
    // Committed at once: the pending debounce is cancelled, so one request.
    await new Promise((r) => setTimeout(r, 400));
    expect(get.mock.calls.filter(([u]) => String(u).includes("q=sara"))).toHaveLength(1);
  });

  it("searches 300ms after typing stops, as one request", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));
    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");

    jest.useFakeTimers();
    try {
      const input = screen.getByLabelText("Search students");
      fireEvent.changeText(input, "sa");
      await act(async () => { jest.advanceTimersByTime(200); });
      fireEvent.changeText(input, "sara");
      await act(async () => { jest.advanceTimersByTime(200); });
      expect(get.mock.calls.some(([u]) => String(u).includes("q="))).toBe(false);
      await act(async () => { jest.advanceTimersByTime(100); });
      const searched = get.mock.calls.filter(([u]) => String(u).includes("q="));
      expect(searched).toEqual([["/api/v1/students?status=active&q=sara"]]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("pads the list's bottom by the shell's inset (the tab bar is present)", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));
    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");
    const style = StyleSheet.flatten(
      screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle,
    );
    expect(style.paddingBottom).toBeGreaterThanOrEqual(96);
  });

  // Owner 2026-11-07: Alumni and Dropped are a filter on the list, not pages linked above it.
  it("offers Alumni and Dropped in the filter sheet, by role", async () => {
    get.mockResolvedValue(page([activeRow]));
    useSessionStore.setState(superSession);
    const { unmount } = renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");
    expect(screen.queryByText("Dropped students")).toBeNull();
    fireEvent.press(screen.getByLabelText("Filter"));
    fireEvent.press(await screen.findByLabelText(/^Alumni/));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students?status=alumni"));
    expect(screen.getByLabelText(/^Dropped/)).toBeTruthy();
    unmount();

    useSessionStore.setState(mentorSession);
    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");
    fireEvent.press(screen.getByLabelText("Filter"));
    expect(await screen.findByLabelText(/^Alumni/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Dropped/)).toBeNull();
  });

  it("names the latest finished season when there is no active one", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([{ ...activeRow, activeSeasonTitle: null, lastSeasonTitle: "GBV 2025", currentGroupName: null }]));
    renderWithProviders(<StudentsScreen />);
    expect(await screen.findByText("Last season: GBV 2025 · Cairo University")).toBeTruthy();
  });

  it("loads the next page through the cursor", async () => {
    useSessionStore.setState(superSession);
    get.mockImplementation((url: string) =>
      url.includes("cursor=21")
        ? Promise.resolve(page([{ ...activeRow, id: 22, name: "Second Student" }], null, 2))
        : Promise.resolve(page([activeRow], 21, 2)),
    );

    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");
    fireEvent.press(screen.getByText("Load more"));

    expect(await screen.findByText("Second Student")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&cursor=21");
  });
});

describe("Students on the Alumni filter (?show=alumni)", () => {
  it("queries status=alumni and shows the class year", async () => {
    useSessionStore.setState(superSession);
    mockParams = { show: "alumni" };
    get.mockResolvedValue(
      page([{ ...activeRow, graduationYear: 2024, activeSeasonTitle: null, currentGroupName: null }]),
    );

    renderWithProviders(<StudentsScreen />);

    expect(await screen.findByLabelText(/School of 2024/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=alumni");
  });
});

describe("Students on the Dropped filter (?show=dropped)", () => {
  it("renders one row per dropped enrollment (R43), with the reason", async () => {
    const d1 = {
      ...activeRow,
      id: 30,
      name: "Dina Dropped",
      activeSeasonTitle: null,
      currentGroupName: null,
      droppedEnrollment: {
        enrollmentId: 900,
        seasonId: 7,
        seasonTitle: "Spring 2099",
        droppedAt: "2099-06-01T00:00:00.000Z",
        dropReason: "Moved away",
      },
    };
    const d2 = {
      ...d1,
      droppedEnrollment: {
        ...d1.droppedEnrollment,
        enrollmentId: 901,
        seasonId: 8,
        seasonTitle: "Fall 2099",
        dropReason: null,
      },
    };
    useSessionStore.setState(superSession);
    mockParams = { show: "dropped" };
    get.mockResolvedValue(page([d1, d2]));

    renderWithProviders(<StudentsScreen />);

    // The same student twice — enrollment-keyed, never collapsed by user id.
    expect(await screen.findAllByText("Dina Dropped")).toHaveLength(2);
    expect(screen.getByText(/Moved away/)).toBeTruthy();
    expect(screen.getByText(/Dropped from Fall 2099/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=dropped");
  });

  it("never asks a MENTOR's for it: the endpoint refuses them, so the list stays on students", async () => {
    useSessionStore.setState(mentorSession);
    mockParams = { show: "dropped" };
    get.mockResolvedValue(page([activeRow]));

    renderWithProviders(<StudentsScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=active");
    expect(get).not.toHaveBeenCalledWith("/api/v1/students?status=dropped");
  });
});

it("offers SUPER — and only SUPER — a way to create a student", async () => {
  get.mockResolvedValue(page([activeRow]));
  useSessionStore.setState(superSession);
  const { unmount } = renderWithProviders(<StudentsScreen />);
  fireEvent.press(await screen.findByText("New student"));
  expect(mockPush).toHaveBeenCalledWith("/students/new");
  unmount();

  useSessionStore.setState(mentorSession);
  renderWithProviders(<StudentsScreen />);
  await screen.findByText("Sara Student");
  expect(screen.queryByText("New student")).toBeNull();
});

describe("StudentsScreen filter and sort (REG-82)", () => {
  const groups = [
    { id: 3, name: "Group A", description: null, studentCount: 2, leaderNames: [], seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099" },
  ];
  const seasons = [
    { id: 7, code: "s7", title: "Spring 2099", program: "JPC", year: 2099, status: "ACTIVE", startDate: "2099-01-01", endDate: "2099-06-01" },
  ];
  function serve() {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/seasons") return Promise.resolve({ data: { data: { seasons } } });
      if (url === "/api/v1/seasons/7/groups") return Promise.resolve({ data: { data: { groups } } });
      return Promise.resolve(page([activeRow]));
    });
  }

  it("gives a SUPER seasons first, then that season's groups, then sort, each applied at once", async () => {
    useSessionStore.setState(superSession);
    serve();
    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");

    fireEvent.press(screen.getByLabelText("Filter"));
    // No group until a season is picked.
    expect(await screen.findByLabelText(/^All seasons/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Group A/)).toBeNull();
    fireEvent.press(await screen.findByLabelText(/^Spring 2099/));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&seasonId=7"));
    fireEvent.press(await screen.findByLabelText(/^Group A/));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&seasonId=7&groupId=3"),
    );

    fireEvent.press(screen.getByLabelText("University"));
    fireEvent.press(screen.getByRole("tab", { name: "Z to A" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/students?status=active&seasonId=7&groupId=3&sort=university&dir=desc",
      ),
    );
    // The button counts the filters in force: a season, a group and a sort.
    fireEvent.press(screen.getByText("Done"));
    expect(screen.getByLabelText("Filter, 3 active")).toBeTruthy();
  });

  it("gives other staff every group they can read, with Unassigned", async () => {
    useSessionStore.setState(mentorSession);
    serve();
    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");
    fireEvent.press(screen.getByLabelText("Filter"));
    expect(screen.queryByLabelText(/^All seasons/)).toBeNull();
    fireEvent.press(await screen.findByLabelText(/^Group A/));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&groupId=3"));
    fireEvent.press(screen.getByLabelText("Unassigned"));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&groupId=none"));
  });

  it("keeps only Show on the dropped list, whose rows are enrollments", async () => {
    useSessionStore.setState(superSession);
    mockParams = { show: "dropped" };
    serve();
    renderWithProviders(<StudentsScreen />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    fireEvent.press(screen.getByLabelText("Filter, 1 active"));
    expect(await screen.findByText("SHOW")).toBeTruthy();
    expect(screen.queryByText("SORT BY")).toBeNull();
    expect(screen.queryByText("SEASON")).toBeNull();
  });
});
