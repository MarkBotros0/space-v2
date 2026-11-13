import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
const mockPush = jest.fn();
let mockParams: Record<string, string> = { code: "s7" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { toast } from "../design/ui/toaster";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";
import SeasonEditScreen from "../../app/(app)/seasons/[code]/edit";
import NewSeasonScreen from "../../app/(app)/seasons/new";
import SeasonRosterScreen from "../../app/(app)/seasons/[code]/roster/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const ok = (data: unknown) => Promise.resolve({ data: { data } });
const detail = (over: Record<string, unknown> = {}) => ({
  id: 7,
  code: "s7",
  title: "LEAD 2026",
  program: "LEAD",
  requiredProgram: "GBV",
  year: 2026,
  status: "DRAFT",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-12-31T00:00:00.000Z",
  description: null,
  sessionCount: 0,
  assignmentCount: 0,
  quizCount: 0,
  studentCount: 1,
  absenceBudgetMinutes: 240,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [],
  ...over,
});
const listRow = (id: number, program: string) => ({
  id,
  code: `c${id}`,
  title: `${program} ${2020 + id}`,
  program,
  year: 2020 + id,
  status: "COMPLETED",
  startDate: "2020-01-01T00:00:00.000Z",
  endDate: "2020-12-31T00:00:00.000Z",
});

function routeGets(d = detail(), extra: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    "/api/v1/seasons/by-code/s7": d,
    "/api/v1/seasons/7": d,
    "/api/v1/seasons/7/sessions": { sessions: [] },
    "/api/v1/seasons/7/admins": { admins: [] },
    "/api/v1/seasons": {
      seasons: [listRow(1, "GBV"), listRow(2, "GBV"), listRow(3, "ABC"), listRow(4, "LEAD")],
    },
    "/api/v1/seasons/7/roster": {
      roster: [{ userId: 21, name: "Sara", email: "sara@jpc.test", groupId: null, groupName: null }],
    },
    "/api/v1/seasons/7/people-candidates": {
      season: {
        id: 7,
        title: "LEAD 2026",
        requiredProgram: "GBV",
        isCommunityWide: false,
        suggestedSourceId: 2,
        sources: [{ id: 2, code: "c2", title: "GBV 2022", passed: 2, graduated: 0 }],
      },
      people: [21, 22, 23].map((id) => ({
        id,
        name: `P${id}`,
        pool: "student",
        last: null,
        reason: id === 21 ? "Already in this season" : null,
        availability: id === 21 ? "in_season" : "available",
        selectable: id !== 21,
        overridable: false,
        places: [{ seasonId: 2, outcome: id === 23 ? "not_passed" : "passed" }],
      })),
    },
    "/api/v1/seasons/7/groups": {
      groups: [
        {
          id: 3,
          name: "Group A",
          description: null,
          studentCount: 1,
          leaderNames: [],
          seasonId: 7,
          seasonCode: "s7",
          seasonTitle: "LEAD 2026",
        },
      ],
    },
    ...extra,
  };
  get.mockImplementation((url: string) =>
    url in table ? ok(table[url]) : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { code: "s7" };
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("season screen entry points", () => {
  it("gives a super both ways in from the People card and, on a draft, Start season; no Add people tile", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    renderWithProviders(<SeasonDetailScreen />);
    fireEvent.press(await screen.findByText("Community"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/people", params: { code: "s7" } });
    fireEvent.press(screen.getByText("Invite new"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/invite", params: { code: "s7" } });
    expect(screen.queryByText("Add people")).toBeNull();
    fireEvent.press(screen.getByText("Start season"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/start", params: { code: "s7" } });
  });

  it("suggests, on a draft, the passers of the last season who aren't in it yet", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    routeGets();
    renderWithProviders(<SeasonDetailScreen />);
    // P21 passed but is already in; P23 didn't pass: one to suggest.
    expect(await screen.findByText("1 person passed GBV 2022.")).toBeTruthy();
    fireEvent.press(screen.getByText("Add the 1 who passed"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/people", params: { code: "s7", from: "2" } });
  });

  it("gives a season admin both ways in but not Start season", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    routeGets();
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Community")).toBeTruthy();
    expect(screen.getByText("Invite new")).toBeTruthy();
    expect(screen.queryByText("Start season")).toBeNull();
  });

  it("gives an active season both ways in, no suggestion and no Start season", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail({ status: "ACTIVE" }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Community")).toBeTruthy();
    expect(screen.queryByTestId("students-suggestion")).toBeNull();
    expect(screen.queryByText("Start season")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/people-candidates");
  });

  it.each(["COMPLETED", "ARCHIVED"])("gives a %s season neither", async (status) => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail({ status }));
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByLabelText("Edit season");
    expect(screen.queryByText("Community")).toBeNull();
    expect(screen.queryByText("Invite new")).toBeNull();
    expect(screen.queryByText("Start season")).toBeNull();
  });
});

describe("required program on the form", () => {
  it("is a Select on create that lists existing programs, never the season's own", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    post.mockResolvedValue({ data: { data: { id: 9, code: "lead-2026" } } });
    renderWithProviders(<NewSeasonScreen />);
    fireEvent.changeText(await screen.findByLabelText("Program"), "LEAD");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/seasons"));
    fireEvent.press(screen.getByLabelText("Required program"));
    expect(await screen.findByText("ABC")).toBeTruthy();
    expect(screen.getByText("GBV")).toBeTruthy();
    // LEAD is the season's own program (and is in the list): not offered.
    expect(screen.queryByRole("menuitem", { name: "LEAD" })).toBeNull();
    expect(screen.getAllByText("GBV")).toHaveLength(1);
    fireEvent.press(screen.getByText("GBV"));
  });

  it("is sent on create with GBV picked, and a new season can only be a draft", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    post.mockResolvedValue({ data: { data: { id: 9, code: "lead-2026" } } });
    renderWithProviders(<NewSeasonScreen />);
    fireEvent.changeText(await screen.findByLabelText("Program"), "LEAD");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/seasons"));
    fireEvent.press(screen.getByLabelText("Required program"));
    fireEvent.press(await screen.findByText("GBV"));
    // A new season has no status choice: it is a draft.
    expect(screen.queryByText("Status")).toBeNull();
    expect(screen.queryByText("Active")).toBeNull();
  });

  it("is editable on a draft and sent with the full-body save", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    patch.mockResolvedValue({ data: { data: { id: 7, code: "s7" } } });
    renderWithProviders(<SeasonEditScreen />);
    await screen.findByLabelText("Required program");
    fireEvent.press(screen.getByLabelText("Required program"));
    fireEvent.press(await screen.findByText("ABC"));
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/seasons/7",
        expect.objectContaining({ requiredProgram: "ABC", status: "DRAFT" }),
      ),
    );
  });

  it("is read-only once the season has started", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail({ status: "ACTIVE" }));
    renderWithProviders(<SeasonEditScreen />);
    await screen.findByLabelText("Change code");
    expect(screen.queryByLabelText("Required program")).toBeNull();
    expect(screen.getByText("Required program")).toBeTruthy();
    expect(screen.getByText("GBV")).toBeTruthy();
  });
});

describe("removing someone from a draft's roster", () => {
  const openSara = async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<SeasonRosterScreen />);
    fireEvent.press(await screen.findByText("Sara"));
  };

  it("asks first, then deletes the enrollment", async () => {
    routeGets();
    del.mockResolvedValue({ data: { data: { removed: true } } });
    await openSara();
    fireEvent.press(await screen.findByText("Remove from season"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Remove"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/7/enrollments/21"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sara was removed from LEAD 2026."));
  });

  it("says the server's reason when they already have work", async () => {
    routeGets();
    del.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            error: { code: "has_work", message: "This person already has work or attendance recorded in this season." },
          },
        },
      }),
    );
    await openSara();
    fireEvent.press(await screen.findByText("Remove from season"));
    fireEvent.press(screen.getByText("Remove"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("This person already has work or attendance recorded in this season."),
    );
  });

  it("is not offered once the season has started", async () => {
    routeGets(detail({ status: "ACTIVE" }));
    await openSara();
    await screen.findByText("Unassigned");
    expect(screen.queryByText("Remove from season")).toBeNull();
  });
});
