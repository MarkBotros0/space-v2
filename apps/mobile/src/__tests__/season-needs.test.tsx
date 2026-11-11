import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "s7" }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { detail, routeGets } from "./helpers/season-detail-fixtures";
import { atRiskPage, queue } from "./helpers/staff-today-fixtures";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";

const get = apiClient.get as jest.Mock;

/** The season page's reads plus the three queue reads, all scoped to season 7. */
function serve(d: ReturnType<typeof detail>) {
  routeGets(d);
  const base = get.getMockImplementation()!;
  get.mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/submissions?")) return Promise.resolve({ data: { data: queue(3) } });
    if (url.startsWith("/api/v1/reports/engagement/students"))
      return Promise.resolve({ data: { data: atRiskPage(2) } });
    return base(url);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("A running season's Needs attention (owner, 2026-11-07)", () => {
  it("gives a SUPER the three queues, each opening its list narrowed to this season", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    serve(detail({ status: "ACTIVE" }));
    renderWithProviders(<SeasonDetailScreen />);

    expect(await screen.findByText("NEEDS ATTENTION")).toBeTruthy();
    fireEvent.press(await screen.findByLabelText("Essays to review: 3"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submissions", params: { seasonId: "7" } });
    fireEvent.press(screen.getByLabelText("Students at risk: 2"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/attention/at-risk", params: { seasonId: "7" } });
    // No session is missing attendance, so that tile steps aside (owner, 2026-11-09).
    expect(screen.queryByLabelText(/^Sessions without attendance/)).toBeNull();
    expect(screen.queryByLabelText(/^Not invited yet/)).toBeNull();
    const urls = get.mock.calls.map(([u]) => u as string);
    expect(urls.filter((u) => u.startsWith("/api/v1/submissions?")).every((u) => u.includes("seasonId=7"))).toBe(true);
  });

  it("gives the season's ADMIN the same tiles", async () => {
    useSessionStore.setState(makeSession("ADMIN"));
    serve(detail({ status: "ACTIVE" }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByLabelText("Essays to review: 3")).toBeTruthy();
  });

  it("is not shown on a draft, a finished season, or to someone who doesn't administer it", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    serve(detail({ status: "DRAFT" }));
    const a = renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("TEST 2099")).toBeTruthy();
    expect(screen.queryByText("NEEDS ATTENTION")).toBeNull();
    a.unmount();

    serve(detail({ status: "COMPLETED" }));
    const b = renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("TEST 2099")).toBeTruthy();
    expect(screen.queryByText("NEEDS ATTENTION")).toBeNull();
    b.unmount();

    useSessionStore.setState(makeSession("LEADER"));
    serve(detail({ status: "ACTIVE", canAdminister: false }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("TEST 2099")).toBeTruthy();
    expect(screen.queryByText("NEEDS ATTENTION")).toBeNull();
  });
});
