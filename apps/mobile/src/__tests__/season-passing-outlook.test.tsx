import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { PassingOutlook, PassingOutlookRow } from "@space/shared";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), put: jest.fn() } }));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "gbv-2026" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { detail } from "./helpers/season-end-fixtures";
import { makeSession } from "./helpers/session";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";
import SeasonPassingScreen from "../../app/(app)/seasons/[code]/passing";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;

const BY_CODE = "/api/v1/seasons/by-code/gbv-2026";
const OUTLOOK = "/api/v1/seasons/7/passing";

const numbers = (attended: number, submitted: number, scored: number) => ({
  attendance: { attended, total: 10 },
  assignments: { submitted, total: 4 },
  quizzes: { scored, max: 20 },
});
const row = (over: Partial<PassingOutlookRow>): PassingOutlookRow => ({
  userId: 1,
  name: "Student",
  groupName: "Group A",
  numbers: numbers(8, 3, 15),
  score: 70,
  rescaled: false,
  pointsShort: null,
  weakest: "quizzes",
  ...over,
});
const outlook = (over: Partial<PassingOutlook> = {}): PassingOutlook => ({
  criteria: { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 },
  isDefault: false,
  available: { attendance: true, assignments: true, quizzes: true },
  weightsIgnored: [],
  canEditCriteria: true,
  onTrack: 1,
  below: 2,
  rows: [
    row({ userId: 21, name: "Sara Short", score: 52, pointsShort: 8, numbers: numbers(6, 3, 9) }),
    row({ userId: 22, name: "Bob Below", score: 58, pointsShort: 2, weakest: "attendance" }),
    row({ userId: 23, name: "Ann Ontrack", score: 80 }),
  ],
  ...over,
});

function serve(body: PassingOutlook) {
  get.mockImplementation((url: string) => {
    if (url === BY_CODE) return Promise.resolve({ data: { data: detail() } });
    if (url === OUTLOOK) return Promise.resolve({ data: { data: body } });
    return Promise.reject(new Error(`not served: ${url}`));
  });
}
const outlookGets = () => get.mock.calls.filter(([url]) => url === OUTLOOK).length;

async function openSheet() {
  fireEvent.press(await screen.findByRole("button", { name: "Edit criteria" }));
  return within(await screen.findByTestId("sheet"));
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("Passing outlook", () => {
  it("rows below the mark come first with points short and the weakest number", async () => {
    serve(outlook());
    renderStacked(<SeasonPassingScreen />);
    expect(await screen.findByText("1 on track")).toBeTruthy();
    expect(screen.getByText("2 below the mark")).toBeTruthy();
    const rows = screen.getAllByRole("button").filter((b) => /Short|Below|Ontrack/.test(b.props.accessibilityLabel));
    expect(rows.map((r) => r.props.accessibilityLabel.split(",")[0])).toEqual([
      "Sara Short",
      "Bob Below",
      "Ann Ontrack",
    ]);
    const sara = screen.getByRole("button", { name: /^Sara Short/ });
    expect(sara.props.accessibilityLabel).toContain("8 points short");
    expect(sara.props.accessibilityLabel).toContain("Quizzes 45%");
    expect(sara.props.accessibilityLabel).toContain("Below the mark");
    expect(screen.getByRole("button", { name: /^Ann Ontrack/ }).props.accessibilityLabel).toContain("On track");
    fireEvent.press(sara);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
    fireEvent.press(screen.getByRole("button", { name: "Send a reminder" }));
    expect(mockPush).toHaveBeenCalledWith("/announcements/new");
  });

  it("a re-scaled row says so", async () => {
    serve(
      outlook({
        rows: [
          row({
            userId: 30,
            name: "Late Joiner",
            rescaled: true,
            numbers: { ...numbers(0, 3, 15), attendance: { attended: 0, total: 0 } },
          }),
        ],
      }),
    );
    renderStacked(<SeasonPassingScreen />);
    expect(await screen.findByText(/Scored without attendance/)).toBeTruthy();
  });

  it("a leader sees the criteria read-only and no Edit", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5] }));
    serve(outlook({ canEditCriteria: false }));
    renderStacked(<SeasonPassingScreen />);
    expect(await screen.findByText("Attendance 40%")).toBeTruthy();
    expect(screen.getByText("Pass mark 60")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit criteria" })).toBeNull();
    // Leaders never post announcements (docs/rules/announcements.md).
    expect(screen.queryByRole("button", { name: "Send a reminder" })).toBeNull();
  });

  it("the total reads 100% only when the weights add up", async () => {
    serve(outlook());
    renderStacked(<SeasonPassingScreen />);
    const sheet = await openSheet();
    expect(sheet.getByText("Total 100%")).toBeTruthy();
    expect(sheet.queryByText("The weights must add up to 100%.")).toBeNull();
    fireEvent.changeText(sheet.getByLabelText("Attendance weight"), "30");
    expect(sheet.getByText("Total 90%")).toBeTruthy();
    expect(sheet.getByText("The weights must add up to 100%.")).toBeTruthy();
    fireEvent.press(sheet.getByRole("button", { name: "Raise attendance weight" }));
    expect(sheet.getByText("Total 95%")).toBeTruthy();
    fireEvent.press(sheet.getByRole("button", { name: "Raise attendance weight" }));
    expect(sheet.getByText("Total 100%")).toBeTruthy();
    expect(sheet.queryByText("The weights must add up to 100%.")).toBeNull();
    // Off by 10 again: Save refuses and nothing is sent.
    fireEvent.press(sheet.getByRole("button", { name: "Lower quizzes weight" }));
    fireEvent.press(sheet.getByRole("button", { name: "Lower quizzes weight" }));
    expect(sheet.getByText("Total 90%")).toBeTruthy();
    fireEvent.press(sheet.getByRole("button", { name: "Save criteria" }));
    expect(put).not.toHaveBeenCalled();
  });

  it("an unavailable number's field is off and fixed at 0", async () => {
    serve(
      outlook({
        criteria: { weights: { attendance: 60, assignments: 40, quizzes: 0 }, passMark: 60 },
        available: { attendance: true, assignments: true, quizzes: false },
      }),
    );
    renderStacked(<SeasonPassingScreen />);
    const sheet = await openSheet();
    const quizzes = sheet.getByLabelText("Quizzes weight");
    expect(quizzes.props.value).toBe("0");
    expect(quizzes.props.editable).toBe(false);
    expect(sheet.getByText("Nothing to count this season, so it stays at 0.")).toBeTruthy();
    expect(sheet.getByRole("button", { name: "Raise quizzes weight" }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(sheet.getByText("Total 100%")).toBeTruthy();
  });

  it("saving posts and the outlook reloads", async () => {
    serve(outlook());
    put.mockResolvedValue({
      data: { data: { criteria: { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 65 } } },
    });
    renderStacked(<SeasonPassingScreen />);
    const sheet = await openSheet();
    expect(outlookGets()).toBe(1);
    fireEvent.changeText(sheet.getByLabelText("Pass mark"), "65");
    fireEvent.press(sheet.getByRole("button", { name: "Save criteria" }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/seasons/7/pass-criteria", {
        weights: { attendance: 40, assignments: 30, quizzes: 30 },
        passMark: 65,
      }),
    );
    await waitFor(() => expect(outlookGets()).toBe(2));
    expect(toast.success).toHaveBeenCalledWith("Pass criteria saved.");
    // The sheet is closing: it stops taking touches while it animates out.
    await waitFor(() => {
      const backdrop = screen.queryByTestId("sheet-backdrop");
      expect(backdrop === null || backdrop.parent?.props.pointerEvents === "none").toBe(true);
    });
  });

  it("a refused save keeps the sheet open with the server's words", async () => {
    serve(outlook());
    put.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: "weight_on_empty",
            message: "Quizzes has nothing to count this season, so its weight must be 0.",
          },
        },
      },
    });
    renderStacked(<SeasonPassingScreen />);
    const sheet = await openSheet();
    fireEvent.press(sheet.getByRole("button", { name: "Save criteria" }));
    expect(await sheet.findByText("Quizzes has nothing to count this season, so its weight must be 0.")).toBeTruthy();
  });

  it("a season with nothing to count yet offers no criteria to set", async () => {
    serve(
      outlook({ available: { attendance: false, assignments: false, quizzes: false }, onTrack: 0, below: 0, rows: [] }),
    );
    renderStacked(<SeasonPassingScreen />);
    expect(await screen.findByText(/Nothing to count yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit criteria" })).toBeNull();
  });

  it("the season page's Passing tile opens the outlook, for a leader of the season too", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5] }));
    get.mockImplementation((url: string) =>
      url === BY_CODE
        ? Promise.resolve({
            data: {
              data: detail({
                canAdminister: false,
                groups: [{ id: 5, name: "Group A", studentCount: 3, leaderNames: [] }],
              }),
            },
          })
        : Promise.resolve({ data: { data: [] } }),
    );
    renderStacked(<SeasonDetailScreen />);
    fireEvent.press(await screen.findByRole("button", { name: /^Passing/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/passing", params: { code: "gbv-2026" } });
  });

  it("a 403 reads Not available", async () => {
    get.mockImplementation((url: string) =>
      url === BY_CODE
        ? Promise.resolve({ data: { data: detail() } })
        : Promise.reject({
            isAxiosError: true,
            response: { status: 403, data: { error: { code: "forbidden", message: "x" } } },
          }),
    );
    renderStacked(<SeasonPassingScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
  });
});
