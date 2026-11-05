import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked, renderWithProviders } from "./helpers/render";
import QuizzesScreen from "../../app/(app)/quizzes";

const get = apiClient.get as jest.Mock;

const studentSession = {
  user: { id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};
// activeSeasonId is null for every staff role on a real device (it is the
// student profile pointer) — the fixture says so, and the staff season comes
// from GET /api/v1/seasons via useCurrentSeasonId (ruling X8).
const leaderSession = {
  user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
};

const seasonsList = {
  data: { data: { seasons: [{
    id: 7, code: "s26", title: "Spring 2026", program: "TEST", year: 2026, status: "ACTIVE",
    startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z",
  }] } },
};

/** Staff screens make two GETs: the seasons list, then the season's quizzes. */
const STAFF_QUIZZES = "/api/v1/quizzes?seasonId=7&limit=100";

/** `pages` are served in order: the first page bare, the next after its cursor. */
function staffGets(quizPage: unknown, ...more: { cursor: number; page: unknown }[]) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons") return Promise.resolve(seasonsList);
    if (url === STAFF_QUIZZES) return Promise.resolve({ data: { data: quizPage } });
    const next = more.find((m) => url === `${STAFF_QUIZZES}&cursor=${m.cursor}`);
    return next
      ? Promise.resolve({ data: { data: next.page } })
      : Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function staffRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41, title: "Week 1 quiz", kind: "PAPER", publishedAt: null, questionCount: 0,
    maxScore: 20, sessionId: 12, sessionTitle: "Week 1",
    sessionDate: "2099-03-01T18:00:00.000Z", seasonId: 7, seasonCode: "s26",
    gradedCount: 3, studentCount: 8, ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

// The student's rows are pinned in work-screen.test.tsx and work-model.test.ts.
describe("QuizzesScreen — student", () => {
  it("gets Work in place, with the Back bar: no replace, no redirect (P2-11)", async () => {
    useSessionStore.setState({
      ...studentSession,
      scopes: { ...studentSession.scopes, activeSeasonId: null },
    });

    renderStacked(<QuizzesScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText("Your current season")).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("QuizzesScreen — staff", () => {
  it("shows the server's graded progress and routes to the grading screen", async () => {
    useSessionStore.setState(leaderSession);
    staffGets({ items: [staffRow()], nextCursor: null });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Week 1 quiz")).toBeTruthy();
    // One number from the server (ruling C4). v1 computed "graded" three
    // different ways and got three different answers.
    expect(screen.getByText("3/8 graded")).toBeTruthy();
    expect(screen.getByText("Partial")).toBeTruthy();
    expect(screen.getByText("Week 1 · Mar 1, 2099 · Max 20 pts")).toBeTruthy();
    expect(screen.getByText("Quizzes")).toBeTruthy();
    expect(screen.getByText("Grade paper quizzes for your group")).toBeTruthy();

    fireEvent.press(screen.getByText("Week 1 quiz"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/quiz/[id]/grade",
      params: { id: "41" },
    });
  });

  it("shows an online draft as v1 does: graded count and Pending (B3-10)", async () => {
    useSessionStore.setState(leaderSession);
    staffGets({
      items: [staffRow({ id: 51, title: "Online quiz", kind: "ONLINE",
        publishedAt: null, questionCount: 4, maxScore: 7, gradedCount: 0 })],
      nextCursor: null,
    });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Online quiz")).toBeTruthy();
    expect(screen.getByText("0/8 graded")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("orders a leader's quizzes by session date, newest first (v1)", async () => {
    useSessionStore.setState(leaderSession);
    staffGets({
      items: [
        staffRow({ id: 41, title: "Older quiz", sessionDate: "2099-03-01T18:00:00.000Z" }),
        staffRow({ id: 42, title: "Newer quiz", sessionDate: "2099-03-08T18:00:00.000Z", gradedCount: 8 }),
        staffRow({ id: 43, title: "Loose quiz", sessionId: null, sessionTitle: null, sessionDate: null, gradedCount: 0 }),
      ],
      nextCursor: null,
    });
    renderWithProviders(<QuizzesScreen />);
    expect(await screen.findByText("Newer quiz")).toBeTruthy();
    const order = screen.UNSAFE_root
      .findAll((n: { props: { children?: unknown } }) => typeof n.props.children === "string")
      .map((n: { props: { children?: unknown } }) => n.props.children as string);
    expect(order.indexOf("Newer quiz")).toBeLessThan(order.indexOf("Older quiz"));
    expect(order.indexOf("Older quiz")).toBeLessThan(order.indexOf("Loose quiz"));
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("No session · Max 20 pts")).toBeTruthy();
  });

  it("takes a staff season from the seasons list, never from scopes.activeSeasonId (X8)", async () => {
    useSessionStore.setState(leaderSession);
    staffGets({ items: [staffRow()], nextCursor: null });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Week 1 quiz")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");
    expect(get).toHaveBeenCalledWith(STAFF_QUIZZES);
  });

  it("follows nextCursor so the list doesn't stop at the first page", async () => {
    useSessionStore.setState(leaderSession);
    staffGets(
      { items: [staffRow({ id: 90, title: "Page one quiz" })], nextCursor: 90 },
      { cursor: 90, page: { items: [staffRow({ id: 12, title: "Page two quiz" })], nextCursor: null } },
    );

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Page two quiz")).toBeTruthy();
    expect(screen.getByText("Page one quiz")).toBeTruthy();
    expect(get).toHaveBeenCalledWith(`${STAFF_QUIZZES}&cursor=90`);
  });
});
describe("QuizzesScreen — authoring entry points (Task 11)", () => {
  const adminSession = {
    user: { id: 2, name: "Test admin", email: "a@jpc.test", role: "ADMIN" as const, avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
  };

  it("gives an admin a New quiz button", async () => {
    useSessionStore.setState(adminSession);
    staffGets({ items: [], nextCursor: null });
    renderWithProviders(<QuizzesScreen />);
    fireEvent.press(await screen.findByText("New quiz"));
    expect(mockPush).toHaveBeenCalledWith("/quiz/new");
  });

  it("opens an admin's draft ONLINE quiz in the builder, not the grade screen", async () => {
    useSessionStore.setState(adminSession);
    staffGets({
      items: [staffRow({ id: 51, title: "Draft online", kind: "ONLINE", publishedAt: null, questionCount: 0 })],
      nextCursor: null,
    });
    renderWithProviders(<QuizzesScreen />);
    fireEvent.press(await screen.findByText("Draft online"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]/edit", params: { id: "51" } });
  });

  it("gives a leader no New quiz button", async () => {
    useSessionStore.setState(leaderSession);
    staffGets({ items: [], nextCursor: null });
    renderWithProviders(<QuizzesScreen />);
    expect(await screen.findByText("No quizzes yet")).toBeTruthy();
    expect(screen.getByText("Quizzes created by your admin will appear here.")).toBeTruthy();
    expect(screen.queryByText("New quiz")).toBeNull();
  });
});
