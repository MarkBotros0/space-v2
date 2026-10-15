import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
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
function staffGets(quizPage: unknown) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/seasons"
      ? Promise.resolve(seasonsList)
      : url === "/api/v1/quizzes?seasonId=7"
        ? Promise.resolve({ data: { data: quizPage } })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

function studentRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    quizId: 41, title: "Week 1 quiz", kind: "PAPER", maxScore: 20, score: 15,
    notes: "Nice work.", gradedAt: "2099-03-02T10:00:00.000Z",
    sessionTitle: "Week 1", sessionDate: "2099-03-01T18:00:00.000Z",
    attemptStatus: null, ...over,
  };
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

describe("QuizzesScreen — student", () => {
  it("lists results with the score and the average hero", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({
      data: {
        data: {
          items: [studentRow(), studentRow({ quizId: 42, title: "Week 2 quiz", score: 5, maxScore: 10 })],
          nextCursor: null,
        },
      },
    });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Week 1 quiz")).toBeTruthy();
    // v1 row: session line, then the score as "15" + "/20" over "75%".
    expect(screen.getAllByText("Week 1 · Mar 1, 2099").length).toBeGreaterThan(0);
    expect(screen.getByText("15/20")).toBeTruthy(); // "/20" is a nested span
    expect(screen.getByText("/20")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getAllByText("Nice work.")).toHaveLength(2);
    expect(screen.getAllByText("Graded Mar 2, 2099").length).toBe(2);
    // (15/20 + 5/10) / 2 = 62.5% → 63%. Presentation arithmetic over
    // server-supplied scores, not a business rule re-derived on the device.
    expect(screen.getByText("63%")).toBeTruthy();
    expect(screen.getByText("Average score")).toBeTruthy();
    expect(screen.getByText("2 graded · 0 pending")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/quizzes?seasonId=7");
  });

  it("labels an online quiz by its attempt status and opens the runner", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({
      data: {
        data: {
          items: [
            studentRow({ quizId: 51, title: "Online quiz", kind: "ONLINE", score: null,
              notes: null, gradedAt: null, attemptStatus: null }),
            studentRow({ quizId: 52, title: "Waiting quiz", kind: "ONLINE", score: null,
              notes: null, gradedAt: null, attemptStatus: "SUBMITTED" }),
          ],
          nextCursor: null,
        },
      },
    });

    renderWithProviders(<QuizzesScreen />);

    expect(await screen.findByText("Take quiz")).toBeTruthy();
    expect(screen.getByText("Awaiting grading")).toBeTruthy();

    fireEvent.press(screen.getByText("Online quiz"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/quiz/[id]",
      params: { id: "51" },
    });
  });

  it("shows an empty state with no active season and never calls the API", async () => {
    useSessionStore.setState({
      ...studentSession,
      scopes: { ...studentSession.scopes, activeSeasonId: null },
    });

    renderWithProviders(<QuizzesScreen />);

    // v1: the hero still renders ("—") over an empty list.
    expect(await screen.findByText("No quizzes yet")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("does not open a paper quiz — v1 rows for PAPER are not links", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({ data: { data: { items: [studentRow()], nextCursor: null } } });

    renderWithProviders(<QuizzesScreen />);
    fireEvent.press(await screen.findByText("Week 1 quiz"));
    expect(mockPush).not.toHaveBeenCalled();
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
    expect(get).toHaveBeenCalledWith("/api/v1/quizzes?seasonId=7");
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
