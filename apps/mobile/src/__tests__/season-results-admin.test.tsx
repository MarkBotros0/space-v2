import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
let mockParams: Record<string, string> = { code: "gbv-2026" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: jest.fn(), dismissAll: jest.fn(), replace: jest.fn() }),
}));
jest.mock("../screens/reports/export-menu", () => ({ ExportMenu: () => null }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked, renderWithProviders } from "./helpers/render";
import { mockEndpoints, sessionFor } from "./helpers/reports-fixtures";
import { detail } from "./helpers/season-end-fixtures";
import { makeSession } from "./helpers/session";
import ReportsScreen from "../../app/(app)/reports";
import SeasonResultsScreen from "../../app/(app)/seasons/[code]/results";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const RESULTS = "/api/v1/seasons/7/results";

const numbers = {
  attendance: { attended: 8, total: 10 },
  assignments: { submitted: 3, total: 4 },
  quizzes: { scored: 6, max: 10 },
};
const result = (over: Record<string, unknown>) => ({
  userId: 1,
  name: "Mina",
  isAlumnus: false,
  groupName: "Group A",
  attendancePct: 80,
  result: "PASSED",
  reason: null,
  passScore: 72.5,
  numbers,
  figures: numbers,
  againstScore: false,
  setByName: "Admin",
  setAt: "2026-06-30T12:00:00.000Z",
  ...over,
});
const response = (over: Record<string, unknown> = {}) => ({
  season: { id: 7, code: "gbv-2026", title: "GBV 2026", year: 2026, graduatesOnPass: false },
  criteria: { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 },
  results: [
    result({}),
    result({ userId: 2, name: "Nour", passScore: 33.5, againstScore: true }),
    result({ userId: 3, name: "Sara", passScore: 81, result: "NOT_PASSED", againstScore: true }),
  ],
  ...over,
});
function serve(body: unknown) {
  get.mockImplementation((url: string) =>
    url === RESULTS ? Promise.resolve({ data: { data: body } }) : Promise.reject(new Error(`not served: ${url}`)),
  );
}
const row = (name: string): string =>
  screen.getByRole("button", { name: new RegExp(`^${name},`) }).props.accessibilityLabel as string;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  mockParams = { code: "gbv-2026", id: "7" };
});

describe("Results after End", () => {
  it("the season's admin opens Results and corrects one", async () => {
    // A former admin: End took the season out of their token, so the season page is closed to them.
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [] }));
    serve(response());
    patch.mockResolvedValue({ data: { data: { ok: true } } });
    renderStacked(<SeasonResultsScreen />);
    await screen.findByText("Mina");
    expect(screen.getByText("GBV 2026")).toBeTruthy();
    expect(get.mock.calls.map(([u]) => u)).not.toContain("/api/v1/seasons/by-code/gbv-2026");
    expect(row("Mina")).toMatch(/Score 72\.5, Passed$/);
    expect(row("Nour")).toContain("Passed below the mark");
    expect(row("Sara")).toContain("Did not pass above the mark");

    fireEvent.press(screen.getByRole("button", { name: /^Mina,/ }));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    fireEvent.changeText(screen.getByLabelText("Reason"), "Late correction");
    fireEvent.press(screen.getByText("Save result"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/seasons/7/results/1", {
        result: "NOT_PASSED",
        reason: "Late correction",
      }),
    );
  });

  it("each card shows attendance, assignments and quizzes (owner 2026-11-14)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    serve(response());
    renderStacked(<SeasonResultsScreen />);
    await screen.findByText("Mina");
    expect(row("Mina")).toBe("Mina, Group A, Attendance 80%, Assignments 3/4, Quizzes 60%, Score 72.5, Passed");
    expect(screen.getAllByText("8 of 10 sessions")).toHaveLength(3);
    expect(screen.getAllByText("6 of 10 marks")).toHaveLength(3);
    // Two passed, one didn't: the summary counts them and the filter narrows the cards.
    const summary = screen.getByTestId("results-summary");
    expect(within(summary).getByText("2")).toBeTruthy();
    expect(within(summary).getByText(/^Pass mark 60\./)).toBeTruthy();
    fireEvent.press(screen.getByRole("tab", { name: "Not passed, 1" }));
    expect(screen.queryByText("Mina")).toBeNull();
    expect(screen.getByText("Sara")).toBeTruthy();
  });

  it("a season ended before weighted passing still shows the three numbers, read now", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const none = {
      attendance: { attended: 0, total: 0 },
      assignments: { submitted: 2, total: 3 },
      quizzes: { scored: 0, max: 0 },
    };
    serve(response({ criteria: null, results: [result({ passScore: null, numbers: null, figures: none })] }));
    renderStacked(<SeasonResultsScreen />);
    await screen.findByText("Mina");
    expect(screen.getByText(/^Ended before weighted passing/)).toBeTruthy();
    expect(row("Mina")).toBe("Mina, Group A, Attendance No sessions, Assignments 2/3, Quizzes None counted, Passed");
  });

  it("says no score in words for a student End had nothing to count for", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    serve(response({ results: [result({ passScore: null })] }));
    renderStacked(<SeasonResultsScreen />);
    await screen.findByText("Mina");
    expect(row("Mina")).toContain("No score");
  });

  it("shows Not available on a 403", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: { code: "forbidden", message: "You can't do that." } } },
    });
    renderStacked(<SeasonResultsScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
  });

  it("reads the season by its code when no id is given", async () => {
    mockParams = { code: "gbv-2026" };
    useSessionStore.setState(makeSession("SUPER"));
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons/by-code/gbv-2026"
        ? Promise.resolve({ data: { data: detail({ status: "COMPLETED" }) } })
        : url === RESULTS
          ? Promise.resolve({ data: { data: response() } })
          : Promise.reject(new Error(`not served: ${url}`)),
    );
    renderStacked(<SeasonResultsScreen />);
    expect(await screen.findByText("Mina")).toBeTruthy();
  });
});

describe("Reports: Results for a finished season", () => {
  it("an admin opens Results for a season they held", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);
    // Opens on the running season: no Results there.
    const header = await screen.findByTestId("report-season");
    await within(header).findByText("Spring 2099");
    expect(within(header).queryByRole("button", { name: /^Results/ })).toBeNull();

    fireEvent.press(screen.getByLabelText("Choose another season"));
    fireEvent.press(await screen.findByText("Autumn 2098"));
    const results = await within(screen.getByTestId("report-season")).findByRole("button", {
      name: "Results for Autumn 2098",
    });
    fireEvent.press(results);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/seasons/[code]/results",
      params: { code: "autumn-2098", id: "8" },
    });
  });
});
