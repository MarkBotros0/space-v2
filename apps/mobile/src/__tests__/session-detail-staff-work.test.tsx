import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("react-native-qrcode-svg", () => "QRCode");
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: mockPush }),
  // Focused for the whole test: run the effect like a plain useEffect.
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));

import type { SessionDetail } from "@space/shared";

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const baseDetail: SessionDetail = {
  id: 12,
  title: "Week 3",
  description: "Bring your notebook.",
  startsAt: "2099-03-15T18:00:00.000Z",
  dayKey: "2099-03-15",
  startTime: "20:00",
  durationMinutes: 90,
  location: "Hall B",
  youtubeUrl: null,
  recurrenceGroupId: null,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring",
  checkInOpen: false,
  myAttendance: null,
  canMarkAttendance: false,
  canManageCheckIn: false,
};

const checkInState = (over: Record<string, unknown> = {}) => ({
  state: "not_open",
  isOpen: false,
  checkInToken: null,
  checkInOpenAt: null,
  checkInClosedAt: null,
  expiresAt: null,
  expiresAtTime: null,
  ...over,
});

interface RouteState {
  detail: SessionDetail;
  checkIn?: ReturnType<typeof checkInState>;
  roster?: unknown[];
  quizzes?: unknown[];
}

const ok = (data: unknown) => Promise.resolve({ data: { data } });

/** Routes GETs by URL; state is read at call time so a test can change it mid-flight. */
function routeGets(state: RouteState) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12") return ok(state.detail);
    if (url === "/api/v1/sessions/12/check-in") return ok(state.checkIn ?? checkInState());
    if (url === "/api/v1/sessions/12/attendance") return ok({ roster: state.roster ?? [] });
    if (url === "/api/v1/sessions/12/quizzes") return ok({ quizzes: state.quizzes ?? [] });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}
const leader = () => makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("shows staff the session's quizzes (G18; v1 leader/sessions/[id])", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false },
    quizzes: [
      { id: 40, title: "Paper quiz", kind: "PAPER", maxScore: 20, questionCount: 0, publishedAt: null },
      { id: 41, title: "Online quiz", kind: "ONLINE", maxScore: 10, questionCount: 4, publishedAt: null },
    ],
  });
  renderStacked(<SessionDetailScreen />);
  expect(await screen.findByText("QUIZZES")).toBeTruthy();
  expect(screen.getByText("Paper quiz")).toBeTruthy();
  expect(screen.getByText("Max score: 20")).toBeTruthy();
  expect(screen.getByText("Max score: 10 · Draft")).toBeTruthy();
});

it("hides the quiz card when the session has none", async () => {
  useSessionStore.setState(leader());
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false }, quizzes: [] });
  renderStacked(<SessionDetailScreen />);
  expect(await screen.findByText("Week 3")).toBeTruthy();
  await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/quizzes"));
  expect(screen.queryByText("QUIZZES")).toBeNull();
});

it("goes straight to grading from a quiz row (v1's Grade link)", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false },
    quizzes: [{ id: 41, title: "Online quiz", kind: "ONLINE", maxScore: 10, questionCount: 4, publishedAt: null }],
  });
  renderStacked(<SessionDetailScreen />);

  expect(await screen.findByText("Online quiz")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Online quiz, Max score: 10 · Draft"));

  expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]/grade", params: { id: "41" } });
});

it("lets a leader override one student's attendance, keeping stored notes (v1 modal; spec 04 D7/R32)", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false },
    roster: [
      {
        studentUserId: 21,
        name: "Sara Student",
        email: "sara@jpc.test",
        groupName: "Group A",
        status: "LATE",
        notes: "Bus strike",
        lateMinutes: 15,
      },
    ],
  });
  post.mockResolvedValue({ data: { data: { saved: 1 } } });

  renderStacked(<SessionDetailScreen />);
  fireEvent.press(await screen.findByText("Sara Student"));
  expect(screen.getByText("Override attendance")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Mark Sara Student ABSENT"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [{ studentUserId: 21, status: "ABSENT", notes: "Bus strike", lateMinutes: null }],
    }),
  );
  // The sheet is closing: it stops taking touches while it animates out.
  await waitFor(() => {
    const backdrop = screen.queryByTestId("sheet-backdrop");
    expect(backdrop === null || backdrop.parent?.props.pointerEvents === "none").toBe(true);
  });
  // Like every other leader write: a confirmation, not just a closed sheet (M3).
  expect(toast.success).toHaveBeenCalledWith("Attendance updated.");
});

it("shows a leader the video quiz results, and nothing for a video with no questions (spec 13 D10)", async () => {
  useSessionStore.setState(leader());
  const detail = { ...baseDetail, youtubeUrl: "https://youtu.be/x", canMarkAttendance: true, canManageCheckIn: false };
  const results = (questionCount: number) => ({
    questionCount,
    totalPoints: questionCount,
    rows: [
      {
        studentUserId: 21,
        studentName: "Sara Student",
        groupId: 3,
        groupName: "Group A",
        answeredCount: 1,
        questionCount,
        earnedPoints: 1,
        totalPoints: questionCount,
        completedAt: null,
      },
    ],
  });
  let questions = 2;
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12") return ok(detail);
    if (url === "/api/v1/sessions/12/attendance") return ok({ roster: [] });
    if (url === "/api/v1/sessions/12/quizzes") return ok({ quizzes: [] });
    if (url === "/api/v1/sessions/12/video-quiz/results") return ok(results(questions));
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });

  const first = renderStacked(<SessionDetailScreen />);
  expect(await screen.findByText("Video quiz results")).toBeTruthy();
  expect(screen.getByText("1/2 answered · 1/2 pts")).toBeTruthy();
  expect(screen.getByText("In progress")).toBeTruthy();
  first.unmount();

  questions = 0;
  renderStacked(<SessionDetailScreen />);
  await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/video-quiz/results"));
  expect(await screen.findByText("Check-in")).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("Video quiz results")).toBeNull());
});

it("shows a failed override inside the sheet, where the leader is looking", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false },
    roster: [
      {
        studentUserId: 21,
        name: "Sara Student",
        email: "sara@jpc.test",
        groupName: "Group A",
        status: null,
        notes: null,
        lateMinutes: null,
      },
    ],
  });
  post.mockRejectedValue(
    Object.assign(new Error("400"), {
      isAxiosError: true,
      response: { status: 400, data: { error: { code: "bad_request", message: "Invalid attendance entries." } } },
    }),
  );
  renderStacked(<SessionDetailScreen />);
  fireEvent.press(await screen.findByText("Sara Student"));
  fireEvent.press(screen.getByLabelText("Mark Sara Student PRESENT"));
  expect(await screen.findByTestId("override-error")).toBeTruthy();
  expect(screen.getByText("Override attendance")).toBeTruthy();
});

it("starts the next student's override sheet without the last failure, after a dismiss", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false },
    roster: [
      {
        studentUserId: 21,
        name: "Sara Student",
        email: "sara@jpc.test",
        groupName: "Group A",
        status: null,
        notes: null,
        lateMinutes: null,
      },
      {
        studentUserId: 22,
        name: "Omar Student",
        email: "omar@jpc.test",
        groupName: "Group A",
        status: null,
        notes: null,
        lateMinutes: null,
      },
    ],
  });
  post.mockRejectedValue(
    Object.assign(new Error("400"), {
      isAxiosError: true,
      response: { status: 400, data: { error: { code: "bad_request", message: "Invalid attendance entries." } } },
    }),
  );
  renderStacked(<SessionDetailScreen />);
  fireEvent.press(await screen.findByText("Sara Student"));
  fireEvent.press(screen.getByLabelText("Mark Sara Student PRESENT"));
  expect(await screen.findByText("Invalid attendance entries.")).toBeTruthy();
  fireEvent.press(screen.getByTestId("sheet-backdrop"));
  // Let the mutation observer publish the reset before the next student's sheet opens.
  await act(async () => {});
  fireEvent.press(screen.getByText("Omar Student"));
  await waitFor(() => expect(screen.queryByTestId("override-error")).toBeNull());
  expect(screen.getByLabelText("Mark Omar Student PRESENT")).toBeTruthy();
});
