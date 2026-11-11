import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import SeasonScreen from "../../app/(app)/season";

const get = apiClient.get as jest.Mock;

const mySeason = {
  id: 7,
  code: "gbv-2026",
  title: "GBV 2026",
  description: "The spring season.",
  status: "ACTIVE" as const,
  startDate: "2026-02-01T00:00:00.000Z",
  endDate: "2026-06-30T00:00:00.000Z",
  progress: { completedSessions: 3, totalSessions: 7, pct: 43 },
  group: {
    id: 4,
    name: "Group B1",
    description: "Tuesday group",
    leaders: [{ id: 5, name: "Lina Leader", email: "lina@jpc.test" }],
    members: [
      { id: 6, name: "Peer Person", isYou: false },
      { id: 9, name: "Test student", isYou: true },
    ],
  },
  upcoming: [
    { id: 41, title: "Week 4", startsAt: "2099-03-22T18:00:00.000Z", dayKey: "2099-03-22", location: "Hall B" },
  ],
};

const ASSIGNMENTS = "/api/v1/seasons/7/assignments";
const QUIZZES = "/api/v1/quizzes?seasonId=7";

const handedIn = (id: number, title: string, submittedAt: string, status = "SUBMITTED") => ({
  id,
  title,
  dueAt: null,
  dueOrgDay: null,
  isOverdue: false,
  status,
  reviewedAt: null,
  submittedAt,
});
const takenQuiz = (quizId: number, title: string, sessionDate: string) => ({
  quizId,
  title,
  kind: "ONLINE",
  maxScore: 10,
  score: 8,
  notes: null,
  gradedAt: null,
  sessionTitle: null,
  sessionDate,
  attemptStatus: "GRADED",
  answersReleased: true,
});

/** Routes by URL: the season, and the two lists the submissions card reads. */
function serve(season: unknown = mySeason, assignments: unknown[] = [], quizzes: unknown[] = []) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/me/season") return Promise.resolve({ data: { data: { season } } });
    if (url === ASSIGNMENTS) return Promise.resolve({ data: { data: { assignments } } });
    if (url === QUIZZES) return Promise.resolve({ data: { data: { items: quizzes, nextCursor: null } } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SeasonScreen — STUDENT branch (v1 student/season)", () => {
  it("renders the season, server-derived progress, the group with leaders, and the next sessions", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    serve();

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("GBV 2026")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/season");
    // Neither the staff detail read nor the seasons list (spec 02 §5 over-fetch).
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7");
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
    expect(screen.getByText("Session 3 of 7")).toBeTruthy(); // R29, not "Week N of M"
    expect(screen.getByText("4 to go")).toBeTruthy();
    expect(screen.getByText("YOUR GROUP")).toBeTruthy();
    expect(screen.getByText("Group B1")).toBeTruthy();
    expect(screen.getByText("Tuesday group")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy(); // the season status chip, a word
    expect(screen.getByText("Leader")).toBeTruthy();
    expect(screen.getByText("Lina Leader")).toBeTruthy();
    expect(screen.queryByText("lina@jpc.test")).toBeNull(); // no email contact (owner, 2026-11-07)
    // One card (owner, 2026-11-07): name, leader and members, not list rows.
    expect(screen.getByTestId("group-card")).toBeTruthy();
    expect(screen.getByText("Members (2)")).toBeTruthy();
    expect(screen.getByText("Peer Person")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("The spring season.")).toBeTruthy();
    expect(screen.getByText("Week 4")).toBeTruthy();
    expect(screen.queryByText("Save changes")).toBeNull(); // no staff edit
  });

  it("opens an upcoming session and the calendar", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    serve();

    renderWithProviders(<SeasonScreen />);

    fireEvent.press(await screen.findByLabelText(/^Week 4,/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "41" } });
    fireEvent.press(screen.getByText("See calendar"));
    expect(mockPush).toHaveBeenCalledWith("/calendar");
  });

  it("omits the group card without a group and says when nothing is upcoming", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    serve({ ...mySeason, group: null, upcoming: [] });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No upcoming sessions.")).toBeTruthy();
    expect(screen.queryByText("YOUR GROUP")).toBeNull();
  });

  it("says so when the group has no leaders yet", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    const group = { ...mySeason.group, leaders: [] };
    serve({ ...mySeason, group });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No leaders assigned yet.")).toBeTruthy();
    expect(screen.queryByText("Lina Leader")).toBeNull();
  });

  it("names a leader without an email or a mail link (owner, 2026-11-07)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    serve();

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("Lina Leader")).toBeTruthy();
    expect(screen.queryByText("lina@jpc.test")).toBeNull();
    expect(screen.queryByRole("button", { name: /Lina Leader/ })).toBeNull();
  });

  it("titles the screen with the season and says which session it is on", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    serve();

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("GBV 2026")).toBeTruthy();
    expect(screen.getByText("Session 3 of 7")).toBeTruthy();
    expect(screen.getByText("NEXT SESSION")).toBeTruthy();
  });

  // Owner 2026-11-07: the next session only; the rest are on the calendar.
  it("shows only the next session", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    const later = {
      id: 42,
      title: "Week 5",
      startsAt: "2099-03-29T18:00:00.000Z",
      dayKey: "2099-03-29",
      location: null,
    };
    serve({ ...mySeason, upcoming: [...mySeason.upcoming, later] });
    renderWithProviders(<SeasonScreen />);
    expect(await screen.findByText("Week 4")).toBeTruthy();
    expect(screen.queryByText("Week 5")).toBeNull();
  });

  // Owner 2026-11-07: the last assignment handed in and the last quiz taken, and See all.
  it("shows the latest assignment and quiz handed in, with See all to My work", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    serve(
      mySeason,
      [
        handedIn(1, "Old essay", "2099-01-10T10:00:00.000Z", "REVIEWED"),
        handedIn(2, "New essay", "2099-03-01T10:00:00.000Z"),
      ],
      [takenQuiz(3, "Old quiz", "2099-01-12"), takenQuiz(4, "New quiz", "2099-03-02")],
    );
    renderWithProviders(<SeasonScreen />);
    expect(await screen.findByText("New essay")).toBeTruthy();
    expect(await screen.findByText("New quiz")).toBeTruthy();
    expect(screen.getByText("YOUR SUBMISSIONS")).toBeTruthy();
    expect(screen.queryByText("Old essay")).toBeNull();
    expect(screen.queryByText("Old quiz")).toBeNull();
    fireEvent.press(screen.getByText("See all"));
    expect(mockPush).toHaveBeenCalledWith("/work");
  });

  it("says when nothing has been handed in yet", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    serve();
    renderWithProviders(<SeasonScreen />);
    expect(await screen.findByText("Nothing handed in yet.")).toBeTruthy();
  });

  it("shows the no-season state without a request when the student has no active season (R28)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows the same state when the server answers null (deleted season — spec 02 D2)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    serve(null);

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
  });
});
