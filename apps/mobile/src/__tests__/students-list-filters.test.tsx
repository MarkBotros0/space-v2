import { fireEvent, screen, waitFor } from "@testing-library/react-native";

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
  user: {
    id: 1,
    name: "Test super",
    email: "sup@jpc.test",
    role: "SUPER" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: emptyScopes,
};
const mentorSession = {
  user: {
    id: 2,
    name: "Test mentor",
    email: "men@jpc.test",
    role: "MENTOR" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: emptyScopes,
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
    {
      id: 3,
      name: "Group A",
      description: null,
      studentCount: 2,
      leaderNames: [],
      seasonId: 7,
      seasonCode: "s7",
      seasonTitle: "Spring 2099",
    },
  ];
  const seasons = [
    {
      id: 7,
      code: "s7",
      title: "Spring 2099",
      program: "JPC",
      year: 2099,
      status: "ACTIVE",
      startDate: "2099-01-01",
      endDate: "2099-06-01",
    },
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
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&seasonId=7&groupId=3"));

    fireEvent.press(screen.getByLabelText("University"));
    fireEvent.press(screen.getByRole("tab", { name: "Z to A" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&seasonId=7&groupId=3&sort=university&dir=desc"),
    );
    // The button counts the filters in force: a season, a group and a sort.
    fireEvent.press(screen.getByText("Done"));
    expect(screen.getByLabelText("Filter, 3 active")).toBeTruthy();
  });

  it("gives other staff every group they can read, with Unassigned", async () => {
    useSessionStore.setState({ ...mentorSession, user: { ...mentorSession.user, role: "ADMIN" as const } });
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

  it("gives a mentor nothing season-shaped: no group or season on a row or in the sheet, and Absent lately", async () => {
    useSessionStore.setState(mentorSession);
    serve();
    renderWithProviders(<StudentsScreen />);
    expect(await screen.findByText("Cairo University · Engineering")).toBeTruthy();
    expect(screen.queryByText(/Spring 2099/)).toBeNull();
    // Their people are a Community of members, students and alumni alike (owner, 2026-11-07).
    expect(screen.getByText("Community")).toBeTruthy();
    expect(screen.getByLabelText("Search members")).toBeTruthy();
    expect(screen.queryByText("Students")).toBeNull();
    fireEvent.press(screen.getByLabelText("Filter"));
    expect(await screen.findByText("WHO")).toBeTruthy();
    expect(screen.queryByText("GROUP")).toBeNull();
    expect(screen.queryByLabelText(/^Season/)).toBeNull();
    fireEvent.press(screen.getByLabelText(/^Absent lately/));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&absentLately=1"));
  });

  it("opens a mentor's list on Absent lately from Home's card", async () => {
    useSessionStore.setState(mentorSession);
    mockParams = { absent: "1" };
    serve();
    renderWithProviders(<StudentsScreen />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&absentLately=1"));
    expect(await screen.findByText("1 member absent lately")).toBeTruthy();
  });
});
