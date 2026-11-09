import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { FlatList, Keyboard, StyleSheet } from "react-native";

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

describe("override", () => {
  it("is offered on blocked rows when the server says so", async () => {
    await open();
    expect(screen.getAllByText("Override")).toHaveLength(2);
  });

  it("is offered to the season's admin too (owner, 2026-11-07)", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    await open();
    expect(screen.getAllByText("Override")).toHaveLength(2);
  });

  it("isn't offered where the server withholds it", async () => {
    serve(people(false));
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
    fireEvent.press(screen.getByText("Select all available (2)"));
    fireEvent.press(screen.getByText("Add 2 people"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/enrollments", { userIds: expect.arrayContaining([1, 2]) });
    expect(post.mock.calls[0]![1]).not.toHaveProperty("overrideUserIds");
    expect(toast.success).toHaveBeenCalledWith("Added 2 people");
  });

  it("on a 409 toasts the message, refetches, drops who is no longer selectable and keeps the rest", async () => {
    post.mockRejectedValue(refusal("Nour Hany is already leading a group in GBV 2026"));
    await open();
    fireEvent.press(screen.getByText("Select all available (2)"));
    tick("Hala Fouad");
    const gets = get.mock.calls.length;
    // Nour has taken a role in the meantime
    list = list.map((r) =>
      r.id === 2
        ? { ...r, availability: "in_role" as const, reason: "Leading a group in GBV 2026", selectable: false }
        : r,
    );
    fireEvent.press(screen.getByText("Add 3 people"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nour Hany is already leading a group in GBV 2026"));
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

describe("keyboard", () => {
  afterEach(() => jest.restoreAllMocks());

  // The list is laid out by a no-scroll Screen, so the room the keyboard takes
  // must come off the list's own box: the last row has to scroll above both.
  function listBottomPadding(): number {
    let node = screen.UNSAFE_getByType(FlatList).parent;
    while (node) {
      const padding = StyleSheet.flatten(node.props?.style)?.paddingBottom;
      if (typeof padding === "number") return padding;
      node = node.parent;
    }
    throw new Error("no padded ancestor");
  }

  it("shrinks the list by the keyboard, so the last row scrolls above it and the pinned bar", async () => {
    // Several parts of the screen subscribe; every one hears the event.
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, cb: never) => {
      (listeners[event] ??= []).push(cb);
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    await open();
    const closed = listBottomPadding();
    act(() => {
      for (const cb of listeners.keyboardWillShow ?? listeners.keyboardDidShow ?? [])
        cb({ endCoordinates: { height: 300, screenY: 544 } });
    });
    expect(listBottomPadding()).toBeGreaterThanOrEqual(closed + 250);
    expect(screen.UNSAFE_getByType(FlatList).props.keyboardShouldPersistTaps).toBe("handled");
    // Let the keyboard hook's retry timers run out before the environment goes.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
  });
});
