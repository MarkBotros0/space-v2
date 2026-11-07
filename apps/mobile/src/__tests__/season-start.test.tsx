import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "gbv-2027" }),
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace, dismissAll: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";
import StartSeasonScreen from "../../app/(app)/seasons/[code]/start";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const del = apiClient.delete as jest.Mock;

const BY_CODE = "/api/v1/seasons/by-code/gbv-2027";
const CHECK = "/api/v1/seasons/7/start-check";
const detail = (over: Record<string, unknown> = {}) => ({
  id: 7, code: "gbv-2027", title: "GBV 2027", program: "GBV", year: 2027, status: "DRAFT",
  startDate: "2027-01-01T00:00:00.000Z", endDate: "2027-06-30T00:00:00.000Z", description: null,
  sessionCount: 0, studentCount: 4, absenceBudgetMinutes: 180, absenceWeightMinutes: 90,
  canAdminister: true, groups: [], ...over,
});
const issue = (over: Record<string, unknown> = {}) => ({
  userId: 1, name: "Mina", seat: "student", reason: "already_in_role",
  message: "Mina is already a student in GBV 2026", otherSeasonCode: "gbv-2026", ...over,
});
const ready = { ready: true, items: [], seasonsInTheWay: [] };

let checks: unknown[];
function serve(season = detail()) {
  get.mockImplementation((url: string) => {
    if (url === BY_CODE) return Promise.resolve({ data: { data: season } });
    if (url === CHECK) {
      const next = checks.length > 1 ? checks.shift() : checks[0];
      return next instanceof Error ? Promise.reject(next) : Promise.resolve({ data: { data: next } });
    }
    return Promise.reject(new Error(`not served: ${url}`));
  });
}
const apiFail = (status: number, code: string, message: string) =>
  Object.assign(new Error(message), { isAxiosError: true, response: { status, data: { error: { code, message } } } });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
  post.mockResolvedValue({ data: { data: { season: { id: 7, code: "gbv-2027", status: "ACTIVE" } } } });
  del.mockResolvedValue({ data: { data: {} } });
});

describe("ready", () => {
  it("says who goes live, pins Start season, confirms, then replaces to the season", async () => {
    checks = [ready];
    serve();
    renderStacked(<StartSeasonScreen />);
    expect(await screen.findByText("Everyone's clear. Starting makes this season live for 4 people.")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Start season" }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.press(screen.getAllByRole("button", { name: "Start season" })[0]!);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/start"));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "gbv-2027" } }),
    );
  });
});

describe("not ready", () => {
  const items = [
    issue(),
    issue({ userId: 2, name: "Sara", reason: "did_not_pass", message: "Sara did not pass GBV 2026", otherSeasonCode: null }),
    issue({ userId: 3, name: "Dina", seat: "leader", reason: "leader_has_group", message: "Dina is already leading a group in GBV 2026", otherSeasonCode: null }),
    issue({ userId: 4, name: "Hany", seat: "admin", reason: "is_alumnus", message: "Hany is an alumnus", otherSeasonCode: null }),
  ];

  it("lists the seasons in the way first, each with its message and Open {title}", async () => {
    const way = { id: 3, code: "3g-2026", title: "3G 2026", message: "3G 2026 is still running. End it first." };
    checks = [{ ready: false, seasonsInTheWay: [way], items: [issue()] }];
    serve();
    renderStacked(<StartSeasonScreen />);
    expect(await screen.findByText("3G 2026 is still running. End it first.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start season" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Open 3G 2026" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "3g-2026" } });
    const order = screen.getAllByText(/is still running|is already a student/).map((n) => n.props.children);
    expect(order).toEqual(["3G 2026 is still running. End it first.", "Mina is already a student in GBV 2026"]);
  });

  it("groups by seat with counts, shows reasons in words and no Start", async () => {
    checks = [{ ready: false, seasonsInTheWay: [], items }];
    serve();
    renderStacked(<StartSeasonScreen />);
    expect(await screen.findByText("Sort these out first")).toBeTruthy();
    expect(screen.getByText("STUDENTS (2)")).toBeTruthy();
    expect(screen.getByText("LEADERS (1)")).toBeTruthy();
    expect(screen.getByText("ADMINS (1)")).toBeTruthy();
    expect(screen.getByText("Sara did not pass GBV 2026")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start season" })).toBeNull();
  });

  it("offers Override only for did_not_pass and never_finished, and Open for another season", async () => {
    checks = [{ ready: false, seasonsInTheWay: [], items }];
    serve();
    renderStacked(<StartSeasonScreen />);
    await screen.findByText("Sort these out first");
    expect(screen.getAllByRole("button", { name: /^Override/ })).toHaveLength(1);
    fireEvent.press(screen.getByRole("button", { name: /^Open gbv-2026/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "gbv-2026" } });
  });

  it("Remove on a student deletes the enrollment and refetches; Start appears when empty", async () => {
    checks = [{ ready: false, seasonsInTheWay: [], items: [issue()] }, ready];
    serve();
    renderStacked(<StartSeasonScreen />);
    await screen.findByText("Sort these out first");
    fireEvent.press(screen.getByRole("button", { name: /^Remove/ }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/7/enrollments/1"));
    expect(await screen.findByText(/Everyone's clear/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start season" })).toBeTruthy();
  });

  it("Remove on a student with work says why in a toast", async () => {
    checks = [{ ready: false, seasonsInTheWay: [], items: [issue()] }];
    serve();
    del.mockRejectedValue(apiFail(409, "has_work", "Mina has work in this season"));
    renderStacked(<StartSeasonScreen />);
    await screen.findByText("Sort these out first");
    fireEvent.press(screen.getByRole("button", { name: /^Remove/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Mina has work in this season"));
  });

  it("Remove on an admin calls the season admin route", async () => {
    checks = [{ ready: false, seasonsInTheWay: [], items: [items[3]] }, ready];
    serve();
    del.mockResolvedValue({ data: { data: { admins: [] } } });
    renderStacked(<StartSeasonScreen />);
    await screen.findByText("Sort these out first");
    fireEvent.press(screen.getByRole("button", { name: /^Remove/ }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/7/admins/4"));
  });

  it("a leader is fixed on the season screen (no group id here)", async () => {
    checks = [{ ready: false, seasonsInTheWay: [], items: [items[2]] }];
    serve();
    renderStacked(<StartSeasonScreen />);
    await screen.findByText("Sort these out first");
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Open GBV 2027" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "gbv-2027" } });
  });

  it("Override confirms with the issue's wording, posts, refetches", async () => {
    checks = [{ ready: false, seasonsInTheWay: [], items: [items[1]] }, ready];
    serve();
    renderStacked(<StartSeasonScreen />);
    await screen.findByText("Sort these out first");
    fireEvent.press(screen.getByRole("button", { name: /^Override/ }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.press(screen.getAllByRole("button", { name: "Override" }).slice(-1)[0]!);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/enrollments/2/override"));
    expect(await screen.findByText(/Everyone's clear/)).toBeTruthy();
  });

  it("a start_blocked 409 reloads the list with a toast", async () => {
    checks = [ready, { ready: false, seasonsInTheWay: [], items: [issue()] }];
    serve();
    post.mockRejectedValue(apiFail(409, "start_blocked", "Mina is already a student in GBV 2026"));
    renderStacked(<StartSeasonScreen />);
    await screen.findByText(/Everyone's clear/);
    fireEvent.press(screen.getByRole("button", { name: "Start season" }));
    fireEvent.press(screen.getAllByRole("button", { name: "Start season" })[0]!);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(await screen.findByText("Sort these out first")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("guards", () => {
  it("a non-draft season shows it has started", async () => {
    checks = [ready];
    serve(detail({ status: "ACTIVE" }));
    renderStacked(<StartSeasonScreen />);
    expect(await screen.findByText("This season has already started.")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith(CHECK);
  });

  it("a non-super gets an honest empty state", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    checks = [ready];
    serve();
    renderStacked(<StartSeasonScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith(CHECK);
  });

  it("not_draft from the check also reads as started", async () => {
    checks = [apiFail(409, "not_draft", "This season has already started")];
    serve();
    renderStacked(<StartSeasonScreen />);
    expect(await screen.findByText("This season has already started.")).toBeTruthy();
  });
});
