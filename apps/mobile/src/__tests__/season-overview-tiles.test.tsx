/**
 * The season overview's tiles and next step, per role and status (refactor FE-001: pinned on the
 * screen before the rules moved into seasonOverviewModel, so the move can't reorder or rename one).
 */
import { screen, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "s7" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
}));

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { detail, routeGets } from "./helpers/season-detail-fixtures";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

type Role = "SUPER" | "ADMIN" | "LEADER";
const sessions = (role: Role) =>
  role === "SUPER"
    ? makeSession("SUPER")
    : role === "ADMIN"
      ? makeSession("ADMIN", { seasonAdminIds: [7] })
      : makeSession("LEADER", { groupLeaderIds: [3] });

// The phone's day stands in for the org's (the dashboard read fails in these tests).
const FUTURE_END = "2099-12-31T00:00:00.000Z";
const PAST_END = "2020-12-31T00:00:00.000Z";
const statuses = {
  draft: { status: "DRAFT", endDate: FUTURE_END },
  running: { status: "ACTIVE", endDate: FUTURE_END },
  overdue: { status: "ACTIVE", endDate: PAST_END },
  finished: { status: "COMPLETED", endDate: PAST_END },
} as const;

// countOf joins with a non-breaking space.
const S = "Sessions: 1\u00a0session";
const A = "Assignments: None yet";
const Q = "Quizzes: None yet";
const P = "Passing: Who is on track";
const END = "End season: Results and graduation";
const RESULTS = "Results";

const cases: Array<[Role, keyof typeof statuses, string[], string | null]> = [
  ["SUPER", "draft", [Q, A, S], "This season is a draft"],
  ["SUPER", "running", [Q, A, S, P, END], null],
  ["SUPER", "overdue", [Q, A, S, P], "The end date has passed"],
  ["SUPER", "finished", [S, RESULTS], "This season has finished"],
  ["ADMIN", "draft", [Q, A, S], null],
  ["ADMIN", "running", [Q, A, S, P, END], null],
  ["ADMIN", "overdue", [Q, A, S, P], "The end date has passed"],
  ["ADMIN", "finished", [S, RESULTS], null],
  ["LEADER", "draft", [S], null],
  ["LEADER", "running", [S, P], null],
  ["LEADER", "overdue", [S, P], null],
  ["LEADER", "finished", [S], null],
];

describe("season overview tiles and next step", () => {
  it.each(cases)("%s on a %s season", async (role, status, tiles, nextStep) => {
    useSessionStore.setState(sessions(role));
    routeGets(detail({ ...statuses[status], canAdminister: role !== "LEADER" }));
    renderWithProviders(<SeasonDetailScreen />);

    const grid = await screen.findByTestId("season-actions");
    const shown = within(grid)
      .getAllByRole("button")
      .map((b) => {
        const { accessibilityLabel: label, accessibilityHint: hint } = b.props as Record<string, string | undefined>;
        return hint ? `${label}: ${hint}` : String(label);
      });
    expect(shown).toEqual(tiles);

    const card = screen.queryByTestId("next-step");
    if (nextStep === null) expect(card).toBeNull();
    else expect(within(card!).getByText(nextStep)).toBeTruthy();
  });

  it("says None yet on Sessions for a season with no sessions", async () => {
    useSessionStore.setState(sessions("LEADER"));
    routeGets(detail({ sessionCount: 0, canAdminister: false }));
    renderWithProviders(<SeasonDetailScreen />);
    const grid = await screen.findByTestId("season-actions");
    expect(within(grid).getByRole("button", { name: "Sessions" }).props.accessibilityHint).toBe("None yet");
  });
});
