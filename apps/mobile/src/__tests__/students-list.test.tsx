import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import StudentsScreen from "../../app/(app)/students/index";
import AlumniScreen from "../../app/(app)/students/alumni";
import DroppedScreen from "../../app/(app)/students/dropped";

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
  year: "3rd",
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
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("StudentsScreen (active)", () => {
  it("lists students with the season/group line and the real total", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));

    renderWithProviders(<StudentsScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText(/Spring 2099/)).toBeTruthy();
    expect(screen.getByText("1 total")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=active");
  });

  it("navigates to the detail route on press", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(page([activeRow]));

    renderWithProviders(<StudentsScreen />);
    fireEvent.press(await screen.findByText("Sara Student"));

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

describe("AlumniScreen", () => {
  it("queries status=alumni and shows the class year", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue(
      page([{ ...activeRow, graduationYear: 2024, activeSeasonTitle: null, currentGroupName: null }]),
    );

    renderWithProviders(<AlumniScreen />);

    expect(await screen.findByText(/Class of 2024/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=alumni");
  });
});

describe("DroppedScreen", () => {
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
    get.mockResolvedValue(page([d1, d2]));

    renderWithProviders(<DroppedScreen />);

    // The same student twice — enrollment-keyed, never collapsed by user id.
    expect(await screen.findAllByText("Dina Dropped")).toHaveLength(2);
    expect(screen.getByText(/Moved away/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students?status=dropped");
  });

  it("hides the list from MENTOR — the endpoint refuses them, so the screen never asks", async () => {
    useSessionStore.setState(mentorSession);

    renderWithProviders(<DroppedScreen />);

    expect(await screen.findByText(/isn't available for your role/)).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
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

  it("sends groupId, sort and dir to the list endpoint", async () => {
    useSessionStore.setState(superSession);
    serve();
    renderWithProviders(<StudentsScreen />);
    await screen.findByText("Sara Student");

    fireEvent.press(screen.getByText("Filter and sort"));
    fireEvent.press(await screen.findByLabelText("Group A · Spring 2099"));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&groupId=3"));

    fireEvent.press(screen.getByLabelText("No group"));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&groupId=none"));

    fireEvent.press(screen.getByLabelText("University"));
    fireEvent.press(await screen.findByLabelText("Descending"));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/students?status=active&groupId=none&sort=university&dir=desc"),
    );
  });

  it("offers no filter on the dropped list, whose rows are enrollments", async () => {
    useSessionStore.setState(superSession);
    serve();
    renderWithProviders(<DroppedScreen />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByText("Filter and sort")).toBeNull();
  });
});
