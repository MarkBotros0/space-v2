// Select from community: "Add the people who passed <season>" (owner, 2026-11-07).
// The admin picks a finished season; its passers are ticked, and whoever didn't
// pass it or dropped out is listed apart and ticked only after a question.
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
let mockParams: Record<string, string> = { code: "s7" };
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
  }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonPeopleScreen from "../../app/(app)/seasons/[code]/people";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const detail = (status: "DRAFT" | "ACTIVE") => ({
  id: 7,
  code: "s7",
  title: "GBV 2026",
  program: "GBV",
  year: 2026,
  status,
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-12-31T00:00:00.000Z",
  description: null,
  sessionCount: 0,
  assignmentCount: 0,
  quizCount: 0,
  studentCount: 0,
  absenceBudgetMinutes: 240,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [],
});
type Outcome = "passed" | "not_passed" | "dropped";
const person = (id: number, name: string, places: [number, Outcome][], over: Record<string, unknown> = {}) => ({
  id,
  name,
  pool: "student",
  last: null,
  availability: "available",
  reason: null,
  selectable: true,
  overridable: false,
  places: places.map(([seasonId, outcome]) => ({ seasonId, outcome })),
  ...over,
});
const SOURCES = [
  { id: 25, code: "gbv-2025", title: "GBV 2025", passed: 2, graduated: 1 },
  { id: 24, code: "gbv-2024", title: "GBV 2024", passed: 1, graduated: 0 },
];
const PEOPLE = [
  person(1, "Pia Passed", [[25, "passed"]]),
  person(2, "Paul Passed", [[25, "passed"]]),
  person(3, "Fadi Failed", [
    [25, "not_passed"],
    [24, "passed"],
  ]),
  person(4, "Dina Dropped", [[25, "dropped"]]),
  person(5, "Nadia New", []),
];

function serve(status: "DRAFT" | "ACTIVE", people: unknown[] = PEOPLE) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: detail(status) } });
    if (url === "/api/v1/seasons/7/people-candidates") {
      return Promise.resolve({
        data: {
          data: {
            season: {
              id: 7,
              title: "GBV 2026",
              requiredProgram: null,
              isCommunityWide: false,
              suggestedSourceId: 25,
              sources: SOURCES,
            },
            people,
          },
        },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { code: "s7" };
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
  serve("DRAFT");
});

async function open() {
  renderStacked(<SeasonPeopleScreen />);
  await screen.findByText("Nadia New");
}
const box = (name: string) => screen.getByLabelText(new RegExp(`^${name}`));

describe("the season to bring passers in from", () => {
  it("on an empty draft, opens on the suggested season with its passers ticked and the rest not", async () => {
    await open();
    expect(screen.getByRole("header", { name: "PASSED GBV 2025 (2)" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "DIDN'T FINISH GBV 2025" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "EVERYONE ELSE" })).toBeTruthy();
    expect(box("Pia Passed")).toBeChecked();
    expect(box("Paul Passed")).toBeChecked();
    for (const name of ["Fadi Failed", "Dina Dropped", "Nadia New"]) expect(box(name)).not.toBeChecked();
    expect(
      screen.getByText(
        "We ticked the 2 people who passed GBV 2025. Untick anyone who isn't coming this season. 1 more graduated and is an alumnus now.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Did not pass GBV 2025")).toBeTruthy();
    expect(screen.getByText("Dropped out of GBV 2025")).toBeTruthy();
    expect(screen.getByText("Add 2 people")).toBeTruthy();
  });

  it("asks before ticking someone who didn't pass, then marks them Added by choice", async () => {
    post.mockResolvedValue({ data: { data: { added: 3 } } });
    await open();
    fireEvent.press(box("Fadi Failed"));
    expect(screen.getByText("Add Fadi Failed even though they did not pass GBV 2025?")).toBeTruthy();
    fireEvent.press(screen.getByText("Cancel"));
    expect(box("Fadi Failed")).not.toBeChecked();

    fireEvent.press(box("Dina Dropped"));
    expect(screen.getByText("Add Dina Dropped even though they dropped out of GBV 2025?")).toBeTruthy();
    fireEvent.press(screen.getByText("Add anyway"));
    expect(box("Dina Dropped")).toBeChecked();
    expect(screen.getByText("Added by choice")).toBeTruthy();
    fireEvent.press(screen.getByText("Add 3 people"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/enrollments", {
        userIds: expect.arrayContaining([1, 2, 4]),
      }),
    );
  });

  it("choosing another season unticks only what the first one ticked", async () => {
    await open();
    fireEvent.press(box("Nadia New"));
    fireEvent.press(screen.getByLabelText("Add the people who passed"));
    fireEvent.press(screen.getByText("GBV 2024"));
    expect(box("Fadi Failed")).toBeChecked();
    expect(box("Pia Passed")).not.toBeChecked();
    expect(box("Nadia New")).toBeChecked();
    fireEvent.press(screen.getByLabelText("Add the people who passed"));
    fireEvent.press(screen.getByText("No season"));
    expect(box("Fadi Failed")).not.toBeChecked();
    expect(box("Nadia New")).toBeChecked();
    expect(screen.queryByRole("header", { name: "EVERYONE ELSE" })).toBeNull();
  });

  it("opens on the season named in the link", async () => {
    mockParams = { code: "s7", from: "24" };
    await open();
    expect(box("Fadi Failed")).toBeChecked();
    expect(box("Pia Passed")).not.toBeChecked();
  });

  it("preselects nothing on a running season, or on a draft that already has people", async () => {
    serve("ACTIVE");
    const view = await (async () => {
      const v = renderStacked(<SeasonPeopleScreen />);
      await screen.findByText("Nadia New");
      return v;
    })();
    expect(box("Pia Passed")).not.toBeChecked();
    view.unmount();

    serve("DRAFT", [
      ...PEOPLE,
      person(6, "Omar Here", [], { availability: "in_season", selectable: false, reason: "Already in this season" }),
    ]);
    await open();
    expect(box("Pia Passed")).not.toBeChecked();
    expect(
      screen.getByText("Most seasons start with everyone who passed the last one. Pick a season to tick its passers."),
    ).toBeTruthy();
  });

  it("offers Invite new when no one matches, swapping this screen for its form", async () => {
    await open();
    fireEvent.changeText(screen.getByLabelText("Search people"), "zzz");
    expect(screen.getByText("Not here? They may not have an account yet: invite them instead.")).toBeTruthy();
    fireEvent.press(screen.getAllByText("Invite new").at(-1)!);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/seasons/[code]/invite", params: { code: "s7" } });
  });
});
