import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ id: "3" }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import GroupsScreen from "../../app/(app)/(tabs)/groups";
import GroupDetailScreen from "../../app/(app)/group/[id]/index";

const get = apiClient.get as jest.Mock;

const leaderSession = makeSession(
  "LEADER",
  { groupLeaderIds: [3] },
  { id: 5, name: "Test leader", email: "l@jpc.test" },
);

const groupRow = {
  id: 3,
  name: "Group A",
  description: null,
  studentCount: 8,
  leaderNames: ["Test leader"],
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

const season = (id: number, title: string, status: string) => ({
  id,
  code: `s${id}`,
  title,
  program: "TEST",
  year: 2099,
  status,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
});
const detail = (
  id: number,
  name: string,
  seasonId: number,
  students: { id: number; name: string | null; email?: string }[],
) => ({
  id,
  name,
  description: null,
  seasonId,
  seasonCode: `s${seasonId}`,
  seasonTitle: seasonId === 7 ? "Spring 2026" : "Fall 2025",
  leaders: [],
  students,
  canManage: false,
});

function serveLeaderGroups() {
  get.mockImplementation((url: string) => {
    const body: Record<string, unknown> = {
      "/api/v1/seasons": {
        seasons: [
          season(7, "Spring 2026", "ACTIVE"),
          season(3, "Fall 2025", "ARCHIVED"),
          season(9, "Fall 2026", "DRAFT"),
        ],
      },
      "/api/v1/groups": {
        groups: [
          {
            ...groupRow,
            id: 2,
            name: "Older group",
            seasonId: 3,
            seasonCode: "s3",
            seasonTitle: "Fall 2025",
            studentCount: 0,
          },
          groupRow,
          {
            ...groupRow,
            id: 4,
            name: "Next group",
            seasonId: 9,
            seasonCode: "s9",
            seasonTitle: "Fall 2026",
            studentCount: 0,
          },
        ],
      },
      "/api/v1/groups/4": detail(4, "Next group", 9, []),
      "/api/v1/groups/3": detail(3, "Group A", 7, [
        { id: 21, name: "Sara Student", email: "sara@jpc.test" },
        { id: 22, name: null, email: "noname@jpc.test" },
      ]),
      "/api/v1/groups/2": detail(2, "Older group", 3, []),
    };
    return url in body ? Promise.resolve({ data: { data: body[url] } }) : Promise.reject(new Error(url));
  });
}

it("lists my groups as grouped rows: members, past seasons apart, group and student links", async () => {
  useSessionStore.setState(
    makeSession("LEADER", { groupLeaderIds: [3, 2] }, { id: 5, name: "Test leader", email: "l@jpc.test" }),
  );
  serveLeaderGroups();

  renderWithProviders(<GroupsScreen />);

  expect(await screen.findByText("Sara Student")).toBeTruthy();
  expect(screen.getByText("My group")).toBeTruthy();
  expect(screen.getByText("Spring 2026 · 2 students")).toBeTruthy();
  // A student with no name is listed by email.
  expect(screen.getByText("noname@jpc.test")).toBeTruthy();
  expect((await screen.findAllByText("No students in this group yet.")).length).toBe(1);
  // Past groups render after the current ones, under their own header (spec 05 §9).
  const order = screen.UNSAFE_root.findAll(
    (n: { props: { children?: unknown } }) => typeof n.props.children === "string",
  ).map((n: { props: { children?: unknown } }) => n.props.children as string);
  expect(order.indexOf("Group A")).toBeLessThan(order.indexOf("PAST GROUPS"));
  expect(order.indexOf("PAST GROUPS")).toBeLessThan(order.indexOf("Older group"));
  // A season being set up (DRAFT) is upcoming, not past.
  expect(order.indexOf("Next group")).toBeLessThan(order.indexOf("PAST GROUPS"));

  fireEvent.press(screen.getByText("Group A"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "3" } });
  fireEvent.press(screen.getByText("Sara Student"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
  expect(screen.queryByText("Calendar →")).toBeNull();
});

it("a group's subtitle counts the students listed under it, not the list's active-only count", async () => {
  serveLeaderGroups();

  renderWithProviders(<GroupsScreen />);

  // The row says 8 (active enrolments); two are listed (active and completed members).
  expect(await screen.findByText("Sara Student")).toBeTruthy();
  expect(screen.getByText("Spring 2026 · 2 students")).toBeTruthy();
  expect(screen.queryByText("8 students")).toBeNull();
});

it("a leader who leads nothing gets v1's empty page and no request (R87)", () => {
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [] }));

  renderWithProviders(<GroupsScreen />);

  expect(screen.getByText("You don't lead a group yet.")).toBeTruthy();
  expect(screen.getByText("No group")).toBeTruthy();
  expect(screen.getByText("An admin will add you to a group when you're ready.")).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});

it("shows the leaders' emails but no student emails for a staff caller", async () => {
  get.mockResolvedValue({
    data: {
      data: {
        id: 3,
        name: "Group A",
        description: null,
        seasonId: 7,
        seasonCode: "S26",
        seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader", email: "l@jpc.test" }],
        students: [{ id: 9, name: "Test student", email: "s@jpc.test" }],
        canManage: false,
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  expect(await screen.findByText("Test student")).toBeTruthy();
  // Students are listed by name only (LocalStudentList shows no emails).
  expect(screen.queryByText("s@jpc.test")).toBeNull();
  expect(screen.getByText("l@jpc.test")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/groups/3");
  expect(screen.queryByText("Edit group")).toBeNull();
});

it("renders a student's member list without emails (the contract omits them)", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
  get.mockResolvedValue({
    data: {
      data: {
        id: 3,
        name: "Group A",
        description: null,
        seasonId: 7,
        seasonCode: "S26",
        seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader" }],
        students: [{ id: 9, name: null }],
        canManage: false,
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  expect(await screen.findByText("Unnamed")).toBeTruthy();
  expect(screen.queryByText("s@jpc.test")).toBeNull();
  // A student does not open another student's page: no chevron.
  expect(screen.queryAllByTestId("list-row-chevron")).toHaveLength(0);
  fireEvent.press(screen.getByText("Unnamed"));
  expect(mockPush).not.toHaveBeenCalled();
});

it("a leader pressing a student row in a group opens the student", async () => {
  get.mockResolvedValue({
    data: {
      data: {
        id: 3,
        name: "Group A",
        description: null,
        seasonId: 7,
        seasonCode: "S26",
        seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader", email: "l@jpc.test" }],
        students: [{ id: 9, name: "Test student", email: "s@jpc.test" }],
        canManage: false,
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  fireEvent.press(await screen.findByText("Test student"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "9" } });
  expect(screen.getByText("LEADERS (1)")).toBeTruthy();
  expect(screen.getByText("STUDENTS (1)")).toBeTruthy();
  mockPush.mockClear();
  fireEvent.press(screen.getByText("Test leader"));
  expect(mockPush).not.toHaveBeenCalled();
});
