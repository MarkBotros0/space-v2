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
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack, dismissTo: jest.fn(), dismissAll: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { toast } from "../design/ui/toaster";
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
  studentCount: 0,
  absenceBudgetMinutes: 240,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [],
};

type Row = {
  id: number;
  name: string;
  last: { seasonTitle: string; outcome: "PASSED" | "NOT_PASSED" | "DROPPED" | "COMPLETED"; attendancePct: number | null } | null;
  availability: "available" | "already_passed" | "did_not_pass" | "never_finished" | "in_role" | "in_season";
  reason: string | null;
  selectable: boolean;
  overridable: boolean;
};
const passed = (seasonTitle: string, pct: number) => ({ seasonTitle, outcome: "PASSED" as const, attendancePct: pct });
const row = (r: Partial<Row> & Pick<Row, "id" | "name">): Row => ({
  last: passed("GBV 2026", 88),
  availability: "available",
  reason: null,
  selectable: true,
  overridable: false,
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

function serve(rows: Row[]) {
  list = rows;
  candidates = () =>
    Promise.resolve({
      data: { data: { season: { id: 7, title: "LEAD 2027", requiredProgram: "GBV" }, people: list } },
    });
}

const refusal = (message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code: "people_unavailable", message } } },
  });

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
    expect(screen.getAllByText("Add people to LEAD 2027").length).toBeGreaterThan(0);
    expect(screen.getByText("Requires GBV")).toBeTruthy();
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
    fireEvent.press(screen.getByText("Select all available"));
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

describe("override", () => {
  it("is offered to a super admin only, on blocked rows", async () => {
    await open();
    expect(screen.getAllByText("Override")).toHaveLength(2);
  });

  it("is not offered to an admin", async () => {
    serve(people(false));
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    await open();
    expect(screen.queryByText("Override")).toBeNull();
    expect(screen.getByText("Did not pass GBV 2026")).toBeTruthy();
  });

  it("asks in words for a person who did not pass, then ticks them and sends overrideUserIds", async () => {
    post.mockResolvedValue({ data: { data: { added: 2 } } });
    await open();
    tick("Peter Samy");
    fireEvent.press(screen.getByLabelText("Override Sara Nabil"));
    expect(screen.getByText("Add Sara Nabil even though they did not pass GBV 2026?")).toBeTruthy();
    fireEvent.press(screen.getByText("Add anyway"));
    expect(screen.getByLabelText(/^Sara Nabil/)).toBeChecked();
    fireEvent.press(screen.getByText("Add 2 people"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/enrollments", {
        userIds: expect.arrayContaining([1, 4]),
        overrideUserIds: [4],
      }),
    );
    expect(post.mock.calls[0]![1].userIds).toHaveLength(2);
  });

  it("asks in words for a person who never finished the required program", async () => {
    await open();
    fireEvent.press(screen.getByLabelText("Override Karim Adel"));
    expect(screen.getByText("Add Karim Adel even though they haven't finished GBV?")).toBeTruthy();
    fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByRole("checkbox", { name: /^Karim Adel/ })).toBeNull();
  });
});

describe("adding", () => {
  it("posts the ticked people, toasts the count, refreshes the roster and candidates, and goes back", async () => {
    post.mockResolvedValue({ data: { data: { added: 2 } } });
    await open();
    fireEvent.press(screen.getByText("Select all available"));
    fireEvent.press(screen.getByText("Add 2 people"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/enrollments", { userIds: expect.arrayContaining([1, 2]) });
    expect(post.mock.calls[0]![1]).not.toHaveProperty("overrideUserIds");
    expect(toast.success).toHaveBeenCalledWith("Added 2 people");
  });

  it("on a 409 toasts the message, refetches, drops who is no longer selectable and keeps the rest", async () => {
    post.mockRejectedValue(refusal("Nour Hany is already leading a group in GBV 2026"));
    await open();
    fireEvent.press(screen.getByText("Select all available"));
    tick("Hala Fouad");
    const gets = get.mock.calls.length;
    // Nour has taken a role in the meantime
    list = list.map((r) =>
      r.id === 2
        ? { ...r, availability: "in_role" as const, reason: "Leading a group in GBV 2026", selectable: false }
        : r,
    );
    fireEvent.press(screen.getByText("Add 3 people"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Nour Hany is already leading a group in GBV 2026"),
    );
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(gets));
    expect(await screen.findByText("Add 2 people")).toBeTruthy();
    expect(screen.getByText(/1 person was taken off your selection/)).toBeTruthy();
    expect(screen.getByLabelText(/^Peter Samy/)).toBeChecked();
    expect(screen.getByLabelText(/^Hala Fouad/)).toBeChecked();
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe("states", () => {
  it("shows a skeleton while loading", () => {
    candidates = () => new Promise(() => {});
    renderStacked(<SeasonPeopleScreen />);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });

  it("shows a retry when the candidates fail", async () => {
    candidates = () => Promise.reject(new Error("boom"));
    renderStacked(<SeasonPeopleScreen />);
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
  });

  it("says so when there is no one to list", async () => {
    serve([]);
    renderStacked(<SeasonPeopleScreen />);
    expect(await screen.findByText("No one to add")).toBeTruthy();
  });

  it("is not available to someone who cannot administer the season", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons/by-code/s7"
        ? Promise.resolve({ data: { data: { ...detail, canAdminister: false } } })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
    renderStacked(<SeasonPeopleScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
  });
});
