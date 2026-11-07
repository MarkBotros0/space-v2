import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDismissAll = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "gbv-2026" }),
  useRouter: () => ({ push: mockPush, back: mockBack, dismissAll: mockDismissAll, replace: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";
import EndSeasonScreen from "../../app/(app)/seasons/[code]/end";
import SeasonResultsScreen from "../../app/(app)/seasons/[code]/results";
import { OverdueCallout } from "../screens/season-end/overdue-callout";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const detail = (over: Record<string, unknown> = {}) => ({
  id: 7,
  code: "gbv-2026",
  title: "GBV 2026",
  program: "GBV",
  year: 2026,
  status: "ACTIVE",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-06-30T00:00:00.000Z",
  description: null,
  sessionCount: 0,
  studentCount: 84,
  absenceBudgetMinutes: 180,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [],
  ...over,
});

const subs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ publicId: `pub${i}`, assignmentTitle: `Essay ${i}`, studentName: `Student ${i}` }));
const students = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ userId: i + 1, name: `Student ${i + 1}`, groupName: "Group A", attendancePct: 90 }));
const check = (blockers: Partial<{ submissions: unknown[]; quizAttempts: unknown[]; attendance: unknown[] }>, n = 3, graduatesOnPass = false) => ({
  graduatesOnPass,
  blockers: { submissions: [], quizAttempts: [], attendance: [], ...blockers },
  students: students(n),
});

function serve(routes: Record<string, unknown>) {
  get.mockImplementation((url: string) =>
    url in routes
      ? Promise.resolve({ data: { data: routes[url] } })
      : Promise.reject(new Error(`not served: ${url}`)),
  );
}
/** The dialog's confirm button: the first "End season" button in the tree (the dialog renders before the pinned bar). */
const confirmEnd = () => fireEvent.press(screen.getAllByRole("button", { name: "End season" })[0]!);
const BY_CODE = "/api/v1/seasons/by-code/gbv-2026";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("Manage items", () => {
  const open = async (d: Record<string, unknown>) => {
    serve({ [BY_CODE]: d, "/api/v1/seasons/7/sessions": [], "/api/v1/seasons/7/sessions?": [] });
    renderStacked(<SeasonDetailScreen />);
    await screen.findByText("GBV 2026");
  };

  it("shows End season on an active season for an administering admin", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    await open(detail());
    fireEvent.press(await screen.findByText("End season"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/end", params: { code: "gbv-2026" } });
    expect(screen.queryByText("Results")).toBeNull();
  });

  it("hides End season on a season that is not active", async () => {
    await open(detail({ status: "DRAFT" }));
    await screen.findByText("Edit season");
    expect(screen.queryByText("End season")).toBeNull();
  });

  it("shows Results only to a super admin, only on a finished season", async () => {
    await open(detail({ status: "COMPLETED" }));
    fireEvent.press(await screen.findByText("Results"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/results", params: { code: "gbv-2026" } });
    expect(screen.queryByText("End season")).toBeNull();
  });

  it("does not show Results to an admin", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    await open(detail({ status: "COMPLETED" }));
    await screen.findByText("Roster");
    expect(screen.queryByText("Results")).toBeNull();
  });
});

describe("End season screen", () => {
  it("lists blockers, opens each target and offers no way past them", async () => {
    serve({
      [BY_CODE]: detail(),
      "/api/v1/seasons/7/end-check": check({
        submissions: subs(6),
        quizAttempts: [{ quizId: 4, attemptId: 9, quizTitle: "Week 2 quiz", studentName: "Mina" }],
        attendance: [{ sessionId: 12, title: "Kickoff", startsAt: "2026-03-01T18:00:00.000Z", missing: 5 }],
      }),
    });
    renderStacked(<EndSeasonScreen />);
    expect(await screen.findByText("6 submissions not reviewed")).toBeTruthy();
    expect(screen.getByText("1 quiz attempt not graded")).toBeTruthy();
    expect(screen.getByText("1 session without attendance")).toBeTruthy();
    expect(screen.queryByText("Passed")).toBeNull();

    fireEvent.press(screen.getByText("Essay 0"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "pub0" } });
    fireEvent.press(screen.getByText("Week 2 quiz"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]/grade", params: { id: "4" } });
    fireEvent.press(screen.getByText("Kickoff"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/attendance", params: { id: "12" } });
    expect(screen.queryByRole("button", { name: "End season" })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("reviews every student as Passed, stages a did-not-pass and posts only notPassed", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 84) });
    post.mockResolvedValue({ data: { data: { season: { id: 7, code: "gbv-2026", status: "COMPLETED" }, graduated: 0 } } });
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    expect(screen.getAllByText("Passed")).toHaveLength(84);

    fireEvent.press(screen.getByText("Student 2"));
    expect(screen.getByText("Staff only. The student won't see this.")).toBeTruthy();
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    fireEvent.changeText(screen.getByLabelText("Reason"), "Missed most sessions");
    fireEvent.press(screen.getByText("Done"));
    expect(screen.getAllByText("Did not pass")).toHaveLength(1);

    fireEvent.press(screen.getByText("Student 3"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    fireEvent.press(screen.getByText("Done"));

    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(
      await screen.findByText(
        "This finishes GBV 2026 for 84 students, including 2 who did not pass. Their leaders and admins lose access.",
      ),
    ).toBeTruthy();
    confirmEnd();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/end", {
      notPassed: [
        { userId: 2, reason: "Missed most sessions" },
        { userId: 3, reason: null },
      ],
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
    expect(mockDismissAll).not.toHaveBeenCalled();
  });

  it("sends an administering admin to Today after ending, since they lose the season", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 1) });
    post.mockResolvedValue({ data: { data: { season: { id: 7, code: "gbv-2026", status: "COMPLETED" }, graduated: 0 } } });
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(await screen.findByText("This finishes GBV 2026 for 1 student. Their leaders and admins lose access.")).toBeTruthy();
    confirmEnd();
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("reloads the check on season_unfinished", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 1) });
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: { code: "season_unfinished", message: "Work is waiting." } } },
    });
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    const before = get.mock.calls.filter(([u]) => u === "/api/v1/seasons/7/end-check").length;
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    confirmEnd();
    await waitFor(() =>
      expect(get.mock.calls.filter(([u]) => u === "/api/v1/seasons/7/end-check").length).toBeGreaterThan(before),
    );
    expect(toast.error).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("says someone else already ended it on season_not_active", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 1) });
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: { code: "season_not_active", message: "Not active." } } },
    });
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    confirmEnd();
    expect(await screen.findByText("Someone else already ended this season.")).toBeTruthy();
  });
});

describe("End season screen, losing the race to another admin", () => {
  it("says someone else already ended it on a 403", async () => {
    // The winner's commit marks this admin's sessions stale: the retry after the
    // refresh carries scopes without this season, so End answers 403.
    useSessionStore.setState(makeSession("ADMIN"));
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 1) });
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: { code: "forbidden", message: "You can't do that." } } },
    });
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    confirmEnd();
    expect(await screen.findByText("Someone else already ended this season.")).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("End of a graduating season", () => {
  const ended = (graduated: number) =>
    post.mockResolvedValue({ data: { data: { season: { id: 7, code: "gbv-2026", status: "COMPLETED" }, graduated } } });

  it("warns on the review, counts the graduates in the confirm and says so after", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 13, true) });
    ended(12);
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    expect(screen.getByText("Passing this season graduates them")).toBeTruthy();

    fireEvent.press(screen.getByText("Student 2"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    fireEvent.press(screen.getByText("Done"));
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(await screen.findByText(/12 people will graduate\.$/)).toBeTruthy();

    confirmEnd();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("GBV 2026 has ended. 12 people graduated."));
  });

  it("says one person, in the singular", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 1, true) });
    ended(1);
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(await screen.findByText(/1 person will graduate\.$/)).toBeTruthy();
    confirmEnd();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("GBV 2026 has ended. 1 person graduated."));
  });

  it("has no graduate line when nobody passes", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 1, true) });
    ended(0);
    renderStacked(<EndSeasonScreen />);
    fireEvent.press(await screen.findByText("Student 1"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    fireEvent.press(screen.getByText("Done"));
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    expect(screen.queryByText(/will graduate/)).toBeNull();
    confirmEnd();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("GBV 2026 has ended."));
  });

  it("an ordinary season doesn't mention graduating", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 3) });
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    expect(screen.queryByText("Passing this season graduates them")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    expect(screen.queryByText(/will graduate/)).toBeNull();
  });
});

describe("Correcting a result on a graduating season", () => {
  const open = async (graduatesOnPass: boolean) => {
    serve({
      [BY_CODE]: detail({ status: "COMPLETED", graduatesOnPass }),
      "/api/v1/seasons/7/results": {
        results: [
          { userId: 1, name: "Mina", isAlumnus: true, groupName: null, attendancePct: 90, result: "PASSED", reason: null },
          { userId: 2, name: "Nour", isAlumnus: false, groupName: null, attendancePct: 40, result: "NOT_PASSED", reason: null },
        ],
      },
    });
    renderStacked(<SeasonResultsScreen />);
    await screen.findByText("Mina");
  };
  const KEEPS = "This doesn't remove their alumni status.";
  const WILL = "They'll graduate when you save.";

  it("says Did not pass doesn't remove alumni status", async () => {
    await open(true);
    fireEvent.press(screen.getByText("Mina"));
    expect(screen.queryByText(KEEPS)).toBeNull();
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    expect(screen.getByText(KEEPS)).toBeTruthy();
  });

  it("says Passed graduates someone who isn't an alumnus yet", async () => {
    await open(true);
    fireEvent.press(screen.getByText("Nour"));
    expect(screen.queryByText(WILL)).toBeNull();
    fireEvent.press(screen.getByRole("tab", { name: "Passed" }));
    expect(screen.getByText(WILL)).toBeTruthy();
  });

  it("says neither on an ordinary season", async () => {
    await open(false);
    fireEvent.press(screen.getByText("Mina"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    expect(screen.queryByText(KEEPS)).toBeNull();
  });
});

describe("Result sheet", () => {
  it("caps the reason at the length the server accepts", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 1) });
    renderStacked(<EndSeasonScreen />);
    fireEvent.press(await screen.findByText("Student 1"));
    expect(screen.getByLabelText("Reason").props.maxLength).toBe(1000);
  });
});

describe("Results screen", () => {
  it("lists results and saves a correction", async () => {
    serve({
      [BY_CODE]: detail({ status: "COMPLETED" }),
      "/api/v1/seasons/7/results": {
        results: [
          { userId: 1, name: "Mina", isAlumnus: false, groupName: "Group A", attendancePct: 90, result: "PASSED", reason: null },
          { userId: 2, name: "Nour", isAlumnus: false, groupName: null, attendancePct: 40, result: null, reason: null },
        ],
      },
    });
    patch.mockResolvedValue({ data: { data: { ok: true } } });
    renderStacked(<SeasonResultsScreen />);
    await screen.findByText("Mina");
    expect(screen.getByText("Passed")).toBeTruthy();
    expect(screen.getByText("No result")).toBeTruthy();

    fireEvent.press(screen.getByText("Nour"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    fireEvent.changeText(screen.getByLabelText("Reason"), "Late correction");
    fireEvent.press(screen.getByText("Save result"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/seasons/7/results/2", {
        result: "NOT_PASSED",
        reason: "Late correction",
      }),
    );
  });
});

describe("OverdueCallout", () => {
  it("renders nothing when no season is overdue", async () => {
    serve({ "/api/v1/seasons/overdue": { seasons: [] } });
    renderStacked(<OverdueCallout />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByText(/ended/i)).toBeNull();
  });

  it("names the season and opens its end screen", async () => {
    serve({
      "/api/v1/seasons/overdue": {
        seasons: [{ id: 7, code: "gbv-2026", title: "GBV 2026", endDate: "2026-06-30T00:00:00.000Z" }],
      },
    });
    renderStacked(<OverdueCallout />);
    expect(await screen.findByText("GBV 2026 has ended")).toBeTruthy();
    fireEvent.press(screen.getByText("End season"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/end", params: { code: "gbv-2026" } });
  });
});
