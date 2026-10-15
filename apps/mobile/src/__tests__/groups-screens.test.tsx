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
import GroupsScreen from "../../app/(app)/groups";
import GroupDetailScreen from "../../app/(app)/group/[id]/index";

const get = apiClient.get as jest.Mock;

const leaderSession = makeSession(
  "LEADER",
  { groupLeaderIds: [3] },
  { id: 5, name: "Test leader", email: "l@jpc.test" },
);

const groupRow = {
  id: 3, name: "Group A", description: null, studentCount: 8,
  leaderNames: ["Test leader"], seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

const season = (id: number, title: string, status: string) => ({
  id, code: `s${id}`, title, program: "TEST", year: 2099, status,
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
});
const detail = (id: number, name: string, seasonId: number, students: { id: number; name: string | null; email?: string }[]) => ({
  id, name, description: null, seasonId, seasonCode: `s${seasonId}`, seasonTitle: seasonId === 7 ? "Spring 2026" : "Fall 2025",
  leaders: [], students, canManage: false,
});

function serveLeaderGroups() {
  get.mockImplementation((url: string) => {
    const body: Record<string, unknown> = {
      "/api/v1/seasons": { seasons: [season(7, "Spring 2026", "ACTIVE"), season(3, "Fall 2025", "ARCHIVED"), season(9, "Fall 2026", "DRAFT")] },
      "/api/v1/groups": {
        groups: [
          { ...groupRow, id: 2, name: "Older group", seasonId: 3, seasonCode: "s3", seasonTitle: "Fall 2025", studentCount: 0 },
          groupRow,
          { ...groupRow, id: 4, name: "Next group", seasonId: 9, seasonCode: "s9", seasonTitle: "Fall 2026", studentCount: 0 },
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

it("lists my groups v1-style: members, past seasons apart, student and calendar links", async () => {
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3, 2] }, { id: 5, name: "Test leader", email: "l@jpc.test" }));
  serveLeaderGroups();

  renderWithProviders(<GroupsScreen />);

  expect(await screen.findByText("Sara Student")).toBeTruthy();
  expect(screen.getByText("My groups")).toBeTruthy();
  expect(screen.getByText("3 groups")).toBeTruthy();
  expect(screen.getByText("Spring 2026")).toBeTruthy();
  expect(screen.getByText("noname@jpc.test")).toBeTruthy();
  expect((await screen.findAllByText("No students yet.")).length).toBe(2);
  // Past seasons render after the current ones, under their own eyebrow (spec 05 §9).
  const order = screen.UNSAFE_root.findAll((n: { props: { children?: unknown } }) => typeof n.props.children === "string").map((n: { props: { children?: unknown } }) => n.props.children as string);
  expect(order.indexOf("Group A")).toBeLessThan(order.indexOf("Past seasons"));
  expect(order.indexOf("Past seasons")).toBeLessThan(order.indexOf("Older group"));
  // A season being set up (DRAFT) is upcoming, not past.
  expect(order.indexOf("Next group")).toBeLessThan(order.indexOf("Past seasons"));

  fireEvent.press(screen.getByText("Group A"));
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Sara Student"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
  fireEvent.press(screen.getAllByText("Calendar →")[0]!);
  expect(mockPush).toHaveBeenCalledWith("/calendar");
});

it("a leader who leads nothing gets v1's empty page and no request (R87)", () => {
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [] }));

  renderWithProviders(<GroupsScreen />);

  expect(screen.getByText("You don't lead any groups yet.")).toBeTruthy();
  expect(screen.getByText("No groups")).toBeTruthy();
  expect(screen.getByText("An admin will add you to a group when you're ready.")).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});


it("shows members with emails for a staff caller", async () => {
  get.mockResolvedValue({
    data: {
      data: {
        id: 3, name: "Group A", description: null, seasonId: 7,
        seasonCode: "S26", seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader", email: "l@jpc.test" }],
        students: [{ id: 9, name: "Test student", email: "s@jpc.test" }],
        canManage: false,
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  expect(await screen.findByText("Test student")).toBeTruthy();
  expect(screen.getByText("s@jpc.test")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/groups/3");
  expect(screen.queryByText("Edit group")).toBeNull();
});

it("renders a student's member list without emails (the contract omits them)", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
  get.mockResolvedValue({
    data: {
      data: {
        id: 3, name: "Group A", description: null, seasonId: 7,
        seasonCode: "S26", seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader" }],
        students: [{ id: 9, name: null }],
        canManage: false,
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  expect(await screen.findByText("Unnamed")).toBeTruthy();
  expect(screen.queryByText("s@jpc.test")).toBeNull();
});
