import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "s7" }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: mockBack,
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

const detail = {
  id: 7,
  code: "s7",
  title: "LEAD 2027",
  program: "LEAD",
  year: 2027,
  status: "DRAFT",
  startDate: "2027-01-01T00:00:00.000Z",
  endDate: "2027-12-31T00:00:00.000Z",
  description: null,
  sessionCount: 0,
  assignmentCount: 0,
  quizCount: 0,
  studentCount: 0,
  absenceBudgetMinutes: 240,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [],
};

type Row = {
  id: number;
  name: string;
  pool: "student" | "alumni";
  last: {
    seasonTitle: string;
    outcome: "PASSED" | "NOT_PASSED" | "DROPPED" | "COMPLETED";
    attendancePct: number | null;
  } | null;
  availability: "available" | "already_passed" | "did_not_pass" | "never_finished" | "in_role" | "in_season";
  reason: string | null;
  selectable: boolean;
  overridable: boolean;
  places: { seasonId: number; outcome: "passed" | "not_passed" | "dropped" }[];
};
const passed = (seasonTitle: string, pct: number) => ({ seasonTitle, outcome: "PASSED" as const, attendancePct: pct });
const row = (r: Partial<Row> & Pick<Row, "id" | "name">): Row => ({
  pool: "student",
  last: passed("GBV 2026", 88),
  availability: "available",
  reason: null,
  selectable: true,
  overridable: false,
  places: [],
  ...r,
});

function people(superCaller: boolean): Row[] {
  return [
    row({ id: 1, name: "Peter Samy" }),
    row({ id: 2, name: "Nour Hany", last: passed("GBV 2025", 95) }),
    row({ id: 3, name: "Hala Fouad", availability: "already_passed", reason: "Already passed GBV 2026" }),
    row({
      id: 4,
      name: "Sara Nabil",
      last: { seasonTitle: "GBV 2026", outcome: "NOT_PASSED", attendancePct: 40 },
      availability: "did_not_pass",
      reason: "Did not pass GBV 2026",
      selectable: false,
      overridable: superCaller,
    }),
    row({
      id: 5,
      name: "Karim Adel",
      last: null,
      availability: "never_finished",
      reason: "Hasn't finished GBV yet",
      selectable: false,
      overridable: superCaller,
    }),
    row({
      id: 6,
      name: "Mina Adel",
      availability: "in_role",
      reason: "Leading a group in GBV 2026",
      selectable: false,
    }),
    row({
      id: 8,
      name: "Dina Said",
      availability: "in_role",
      reason: "Leading a group in GBV 2026",
      selectable: true,
    }),
    row({ id: 7, name: "Omar Here", availability: "in_season", reason: "Already in this season", selectable: false }),
  ];
}

let candidates: () => Promise<unknown>;
let list: Row[];

function serve(rows: Row[], isCommunityWide = false) {
  list = rows;
  candidates = () =>
    Promise.resolve({
      data: {
        data: {
          season: {
            id: 7,
            title: "LEAD 2027",
            requiredProgram: "GBV",
            isCommunityWide,
            suggestedSourceId: null,
            sources: [],
          },
          people: list,
        },
      },
    });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
  serve(people(true));
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: detail } });
    if (url === "/api/v1/seasons/7/people-candidates") return candidates();
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

async function open() {
  renderStacked(<SeasonPeopleScreen />);
  await screen.findByText("Peter Samy");
}
const tick = (name: string) => fireEvent.press(screen.getByLabelText(new RegExp(`^${name}`)));
const bar = () => screen.getByTestId("save-bar");

describe("layout", () => {
  it("titles the screen and says which program it requires", async () => {
    await open();
    expect(screen.getAllByText("Select from community").length).toBeGreaterThan(0);
    expect(screen.getByText("Add people who already have an account to LEAD 2027. Requires GBV.")).toBeTruthy();
    expect(screen.getAllByText("GBV 2026 - Passed - 88%").length).toBeGreaterThan(0);
    expect(screen.getByText("GBV 2025 - Passed - 95%")).toBeTruthy();
  });

  it("headers each kind of unavailable row and not the available or already-passed ones", async () => {
    await open();
    for (const h of ["DID NOT PASS", "HASN'T FINISHED", "ALREADY IN A ROLE", "ALREADY IN THIS SEASON"]) {
      expect(screen.getByText(h)).toBeTruthy();
    }
    // Hala (already passed) sits above the first header, so nothing precedes the unavailable kinds but them.
    expect(screen.queryByText("AVAILABLE")).toBeNull();
    expect(screen.queryByText("ALREADY PASSED")).toBeNull();
  });

  it("uses a FlatList that keys its rows", async () => {
    await open();
    const { FlatList } = jest.requireActual("react-native");
    const flat = screen.UNSAFE_getByType(FlatList);
    expect(typeof flat.props.keyExtractor).toBe("function");
  });
});

describe("selection", () => {
  it("Select all available ticks available rows only: not already passed, blocked, or in a role", async () => {
    await open();
    expect(bar()).toBeTruthy();
    fireEvent.press(screen.getByText("Select all available (2)"));
    expect(screen.getByLabelText(/^Peter Samy/)).toBeChecked();
    expect(screen.getByLabelText(/^Nour Hany/)).toBeChecked();
    expect(screen.getByLabelText(/^Hala Fouad/)).not.toBeChecked();
    expect(screen.getByLabelText(/^Dina Said/)).not.toBeChecked();
    expect(screen.getByText("Add 2 people")).toBeTruthy();
  });

  it("lets a person who already passed, and an in-role person on a draft, be ticked by hand, keeping their reasons", async () => {
    await open();
    tick("Hala Fouad");
    tick("Dina Said");
    expect(screen.getByLabelText(/^Hala Fouad.*Already passed GBV 2026/)).toBeChecked();
    expect(screen.getByLabelText(/^Dina Said.*Leading a group in GBV 2026/)).toBeChecked();
    expect(screen.getByText("Add 2 people")).toBeTruthy();
  });

  it("an unavailable row has no tick box and says why in its accessibility label", async () => {
    await open();
    expect(screen.getByLabelText(/^Sara Nabil.*Did not pass GBV 2026/)).toBeTruthy();
    expect(screen.getByLabelText(/^Mina Adel.*Leading a group in GBV 2026/)).toBeTruthy();
    expect(screen.getByLabelText(/^Omar Here.*Already in this season/)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /^Sara Nabil/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /^Mina Adel/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /^Omar Here/ })).toBeNull();
    expect(screen.getByText("Did not pass GBV 2026")).toBeTruthy();
  });

  it("search and the filters compose, and a selection survives filtering", async () => {
    await open();
    tick("Peter Samy");
    fireEvent.changeText(screen.getByLabelText("Search people"), "nour");
    expect(screen.queryByText("Peter Samy")).toBeNull();
    expect(screen.getByText("Nour Hany")).toBeTruthy();
    // the search hid Peter, but he is still counted
    expect(screen.getByText("Add 1 person")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Search people"), "");
    fireEvent.press(screen.getByLabelText("Last season"));
    fireEvent.press(screen.getByText("Last season: GBV 2025"));
    expect(screen.getByText("Nour Hany")).toBeTruthy();
    expect(screen.queryByText("Peter Samy")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Search people"), "peter");
    expect(screen.getByText("No one matches")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Search people"), "");
    fireEvent.press(screen.getByLabelText("Last season"));
    fireEvent.press(screen.getByText("Last season: Any"));
    expect(screen.getByLabelText(/^Peter Samy/)).toBeChecked();
    fireEvent.press(screen.getByText("Available"));
    expect(screen.queryByText("Hala Fouad")).toBeNull();
    expect(screen.queryByText("Sara Nabil")).toBeNull();
    expect(screen.getByText("Nour Hany")).toBeTruthy();
  });

  it("the Add button is disabled at zero", async () => {
    await open();
    expect(screen.getByText("Add 0 people")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add 0 people" })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });
});

const everyone = () => [
  ...people(true),
  row({ id: 21, name: "Alaa Alumni", pool: "alumni", last: passed("GBV 2025", 70) }),
  row({ id: 22, name: "Amir Alumni", pool: "alumni" }),
  row({
    id: 23,
    name: "Aya Alumni",
    pool: "alumni",
    availability: "already_passed",
    reason: "Already passed GBV 2026",
  }),
  row({
    id: 24,
    name: "Abdo Alumni",
    pool: "alumni",
    availability: "in_role",
    reason: "Leading a group",
    selectable: false,
  }),
];
const openWide = async () => {
  serve(everyone(), true);
  await open();
};

describe("students and alumni tabs", () => {
  it("an empty tab with no filter on doesn't suggest clearing one", async () => {
    serve(people(true), true);
    await open();
    fireEvent.press(screen.getByRole("tab", { name: "Alumni" }));
    expect(screen.getByText("No alumni to show")).toBeTruthy();
    expect(screen.queryByText(/clear a filter/)).toBeNull();
  });

  it("a regular season shows no tabs and no alumni", async () => {
    serve([...people(true), row({ id: 21, name: "Alaa Alumni", pool: "alumni" })]);
    await open();
    expect(screen.queryByTestId("segmented-control")).toBeNull();
  });

  it("a community-wide season shows Students | Alumni, each with its own rows", async () => {
    await openWide();
    expect(screen.getByRole("tab", { name: "Students" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Alumni" })).toBeTruthy();
    expect(screen.queryByText("Alaa Alumni")).toBeNull();
    fireEvent.press(screen.getByRole("tab", { name: "Alumni" }));
    expect(screen.getByText("Alaa Alumni")).toBeTruthy();
    expect(screen.queryByText("Peter Samy")).toBeNull();
  });

  it("Select all counts both tabs, ticks both, keeps ticks across tabs and then clears", async () => {
    await openWide();
    fireEvent.press(screen.getByText("Select all available (4)"));
    expect(screen.getByText("Add 4 people")).toBeTruthy();
    expect(screen.getByText("Clear available")).toBeTruthy();
    expect(screen.getByLabelText(/^Peter Samy/)).toBeChecked();
    fireEvent.press(screen.getByRole("tab", { name: "Alumni" }));
    expect(screen.getByLabelText(/^Alaa Alumni/)).toBeChecked();
    expect(screen.getByLabelText(/^Amir Alumni/)).toBeChecked();
    expect(screen.getByLabelText(/^Aya Alumni/)).not.toBeChecked();
    expect(screen.getByLabelText(/^Abdo Alumni/)).toBeTruthy();
    fireEvent.press(screen.getByText("Clear available"));
    expect(screen.getByText("Add 0 people")).toBeTruthy();
    fireEvent.press(screen.getByRole("tab", { name: "Students" }));
    expect(screen.getByLabelText(/^Peter Samy/)).not.toBeChecked();
  });

  it("search and Last season narrow what it ticks, and the count; the tab does not", async () => {
    await openWide();
    fireEvent.changeText(screen.getByLabelText("Search people"), "a");
    // Peter, Nour, Alaa, Amir match "a"... Peter Samy has an a; Nour Hany has an a
    expect(screen.getByText("Select all available (4)")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Search people"), "alaa");
    expect(screen.getByText("Select all available (1)")).toBeTruthy();
    expect(screen.getByText("No students to show")).toBeTruthy();
    fireEvent.press(screen.getByText("Select all available (1)"));
    expect(screen.getByText("Add 1 person")).toBeTruthy();
    expect(screen.getByText(/ticked on the Alumni tab/)).toBeTruthy();
    fireEvent.press(screen.getByRole("tab", { name: "Alumni" }));
    expect(screen.getByText("Alaa Alumni")).toBeTruthy();
    expect(screen.getByLabelText("Search people").props.value).toBe("alaa");
    fireEvent.changeText(screen.getByLabelText("Search people"), "");
    fireEvent.press(screen.getByLabelText("Last season"));
    fireEvent.press(screen.getByText("Last season: GBV 2025"));
    // Nour (student) and Alaa (alumni) last finished GBV 2025
    expect(screen.getByText("Select all available (2)")).toBeTruthy();
    fireEvent.press(screen.getByText("Select all available (2)"));
    expect(screen.getByText("Add 2 people")).toBeTruthy();
  });

  it("posts ticks from both tabs and leaves an unticked person out", async () => {
    post.mockResolvedValue({ data: { data: { added: 2 } } });
    await openWide();
    tick("Peter Samy");
    fireEvent.press(screen.getByRole("tab", { name: "Alumni" }));
    tick("Amir Alumni");
    fireEvent.press(screen.getByText("Add 2 people"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const ids = post.mock.calls[0]![1].userIds as number[];
    expect([...ids].sort()).toEqual([1, 22]);
  });
});
