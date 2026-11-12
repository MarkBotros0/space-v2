import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "gbv-2026" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), dismissAll: jest.fn(), replace: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { detail, scoredCheck } from "./helpers/season-end-fixtures";
import { makeSession } from "./helpers/session";
import EndSeasonScreen from "../../app/(app)/seasons/[code]/end";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const BY_CODE = "/api/v1/seasons/by-code/gbv-2026";
const END_CHECK = "/api/v1/seasons/7/end-check";

function serve(check: unknown) {
  get.mockImplementation((url: string) =>
    url === BY_CODE
      ? Promise.resolve({ data: { data: detail() } })
      : url === END_CHECK
        ? Promise.resolve({ data: { data: check } })
        : Promise.reject(new Error(`not served: ${url}`)),
  );
}
const confirmEnd = () => fireEvent.press(screen.getAllByRole("button", { name: "End season" })[0]!);
/** A student's row, read the way a screen reader says it. */
const row = (name: string): string =>
  screen.getByRole("button", { name: new RegExp(`^${name},`) }).props.accessibilityLabel as string;
const setResult = (name: string, tab: "Passed" | "Did not pass") => {
  fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${name},`) }));
  fireEvent.press(screen.getByRole("tab", { name: tab }));
  fireEvent.press(screen.getByText("Done"));
};
const ended = () =>
  post.mockResolvedValue({
    data: { data: { season: { id: 7, code: "gbv-2026", status: "COMPLETED" }, graduated: 0 } },
  });
const unfinished = (message: string) => ({
  isAxiosError: true,
  response: { status: 409, data: { error: { code: "season_unfinished", message } } },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("End review by the score", () => {
  it("students on track are pre-selected Passed and the rest Did not pass", async () => {
    serve(scoredCheck());
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Mina");
    expect(screen.getByText("Attendance 40%")).toBeTruthy();
    expect(screen.getByText("Pass mark 60")).toBeTruthy();
    expect(row("Mina")).toMatch(/Score 72\.5, on track\nAttendance 80%, assignments 75%, quizzes 60%.*Passed$/s);
    expect(row("Nour")).toMatch(/Score 33\.5, below the mark.*Did not pass$/s);
    expect(row("Sara")).toMatch(/Passed$/);
  });

  it("a re-scaled row says so", async () => {
    serve(scoredCheck());
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Sara");
    expect(row("Sara")).toContain("Score 75.0, on track");
    expect(row("Sara")).toContain("Scored without attendance");
    expect(row("Mina")).not.toContain("Scored without");
  });

  it("a row chosen against its score is labelled", async () => {
    serve(scoredCheck());
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Mina");
    setResult("Nour", "Passed");
    setResult("Mina", "Did not pass");
    expect(row("Nour")).toMatch(/Passed below the mark, Passed$/);
    expect(row("Mina")).toMatch(/Did not pass above the mark, Did not pass$/);
  });

  it("Select all on track and Clear", async () => {
    serve(scoredCheck());
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Mina");
    fireEvent.press(screen.getByRole("button", { name: "Clear" }));
    for (const name of ["Mina", "Nour", "Sara"]) expect(row(name)).toMatch(/Did not pass$/);
    fireEvent.press(screen.getByRole("button", { name: "Select all on track" }));
    expect(row("Mina")).toMatch(/, Passed$/);
    expect(row("Sara")).toMatch(/, Passed$/);
    expect(row("Nour")).toMatch(/Did not pass$/);
  });

  it("changing a weight re-scores and re-selects only rows not changed by hand", async () => {
    serve(scoredCheck());
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Mina");
    setResult("Nour", "Passed");

    fireEvent.press(screen.getByRole("button", { name: "Change criteria" }));
    const sheet = within(await screen.findByTestId("sheet"));
    fireEvent.changeText(sheet.getByLabelText("Attendance weight"), "0");
    fireEvent.changeText(sheet.getByLabelText("Assignments weight"), "0");
    fireEvent.changeText(sheet.getByLabelText("Quizzes weight"), "100");
    fireEvent.press(sheet.getByRole("button", { name: "Use these criteria" }));

    await waitFor(() => expect(row("Sara")).toContain("Score 50.0, below the mark"));
    expect(row("Sara")).toMatch(/Did not pass$/);
    expect(row("Sara")).not.toContain("Scored without");
    expect(row("Nour")).toMatch(/Passed below the mark, Passed$/);
    expect(row("Mina")).toMatch(/Score 60\.0, on track.*Passed$/s);
    expect(screen.getByText("Quizzes 100%")).toBeTruthy();
  });

  it("the POST carries weights, passMark and the scores shown", async () => {
    serve(scoredCheck());
    ended();
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Mina");
    fireEvent.press(screen.getByRole("button", { name: /^Nour,/ }));
    fireEvent.press(screen.getByRole("tab", { name: "Passed" }));
    fireEvent.changeText(screen.getByLabelText("Note"), "Caught up in the last week");
    fireEvent.press(screen.getByText("Done"));

    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(await screen.findByText("End GBV 2026?")).toBeTruthy();
    confirmEnd();
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/end", {
        notPassed: [],
        passedNotes: [{ userId: 2, note: "Caught up in the last week" }],
        weights: { attendance: 40, assignments: 30, quizzes: 30 },
        passMark: 60,
        reviewed: {
          graduatesOnPass: false,
          userIds: [1, 2, 3],
          scores: [
            { userId: 1, score: 72.5 },
            { userId: 2, score: 33.5 },
            { userId: 3, score: 75 },
          ],
        },
      }),
    );
  });

  it("sends weights that fit: an inherited weight on an empty number is moved to the others", async () => {
    serve(scoredCheck({ available: { attendance: true, assignments: true, quizzes: false }, isDefault: true }));
    ended();
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Mina");
    expect(screen.getByText("Quizzes 0%")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText("End GBV 2026?");
    confirmEnd();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).toMatchObject({ weights: { attendance: 57, assignments: 43, quizzes: 0 } });
  });

  it("season_unfinished reloads the check and keeps the choices", async () => {
    serve(scoredCheck());
    post.mockRejectedValueOnce(unfinished("The scores changed; check the season again."));
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Mina");
    setResult("Mina", "Did not pass");
    fireEvent.press(screen.getByRole("button", { name: "Change criteria" }));
    const sheet = within(await screen.findByTestId("sheet"));
    fireEvent.changeText(sheet.getByLabelText("Pass mark"), "50");
    fireEvent.press(sheet.getByRole("button", { name: "Use these criteria" }));

    // A staff mark lands for Nour while the review is open: 4 of 4 assignments now.
    const next = scoredCheck();
    next.students[1] = {
      ...next.students[1]!,
      numbers: { ...next.students[1]!.numbers, assignments: { submitted: 4, total: 4 } },
    };
    serve(next);
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText("End GBV 2026?");
    confirmEnd();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The scores changed; check the season again."));
    // 20 + 30 + 6 = 56.0: on track under the admin's mark of 50, so re-selected Passed.
    await waitFor(() => expect(row("Nour")).toContain("Score 56.0, on track"));
    expect(row("Nour")).toMatch(/, Passed$/);
    expect(row("Mina")).toMatch(/Did not pass above the mark, Did not pass$/);
    expect(screen.getByText("Pass mark 50")).toBeTruthy();
  });
});
