import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import UsersScreen from "../../app/(app)/(tabs)/community";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const superSession = {
  user: {
    id: 1,
    name: "Super",
    email: "su@jpc.test",
    role: "SUPER" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const rows = [
  {
    id: 2,
    name: "Active Ann",
    email: "ann@jpc.test",
    role: "ADMIN" as const,
    graduationYear: 2015,
    lastLoginAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    status: "active" as const,
  },
  {
    id: 3,
    name: "Pending Pete",
    email: "pete@jpc.test",
    role: "STUDENT" as const,
    graduationYear: null,
    lastLoginAt: null,
    deletedAt: null,
    status: "pending" as const,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("CommunityScreen", () => {
  it("renders the list with server-derived status badges (R81 — never re-derived)", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });

    renderWithProviders(<UsersScreen />);

    expect(await screen.findByText("Active Ann")).toBeTruthy();
    // The filters sit in a sheet now: each label is the row's own status chip.
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(screen.getAllByText("No invite")).toHaveLength(1);
  });

  it("shows a row-level invite action only for uninvited/invited accounts, and sends it", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });
    post.mockResolvedValue({
      data: {
        data: {
          issuedAt: "2026-08-24T00:00:00.000Z",
          expiresAt: "2026-08-31T00:00:00.000Z",
          usedAt: null,
          invitedByName: null,
        },
      },
    });

    renderWithProviders(<UsersScreen />);
    await screen.findByText("Pending Pete");

    // Exactly one invite pill: Ann is active, Pete is pending. Beside the row, named for screen readers.
    const inviteButtons = screen.getAllByText("Invite");
    expect(inviteButtons).toHaveLength(1);
    expect(screen.getByLabelText("Send invite to Pending Pete")).toBeTruthy();
    fireEvent.press(inviteButtons[0]!);

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/users/3/invite"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Invite sent to pete@jpc.test."));
  });

  it("says why a row invite failed instead of failing silently", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });
    post.mockRejectedValue(
      Object.assign(new Error("503"), {
        isAxiosError: true,
        response: { status: 503, data: { error: { code: "email_not_configured", message: "x" } } },
      }),
    );
    renderWithProviders(<UsersScreen />);
    await screen.findByText("Pending Pete");
    fireEvent.press(screen.getByText("Invite"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Email isn't set up/)));
  });

  it("reports a network failure as one", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });
    post.mockRejectedValue(Object.assign(new Error("Network Error"), { isAxiosError: true }));
    renderWithProviders(<UsersScreen />);
    await screen.findByText("Pending Pete");
    fireEvent.press(screen.getByText("Invite"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Couldn't reach the server/)));
  });

  it("navigates to the detail route on row press", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });

    renderWithProviders(<UsersScreen />);
    fireEvent.press(await screen.findByText("Active Ann"));

    expect(mockPush).toHaveBeenCalledWith({ pathname: "/user/[id]", params: { id: "2" } });
  });

  it("renders nothing but an empty state for a non-SUPER (the nav never routes them here, the screen still guards)", () => {
    useSessionStore.setState({
      ...superSession,
      user: { ...superSession.user, role: "STUDENT" as const },
    });
    renderWithProviders(<UsersScreen />);
    expect(screen.getByText("Community")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("CommunityScreen — Plan 10 entry points", () => {
  const routeGets = (pending: number) =>
    get.mockImplementation((url: string) =>
      url === "/api/v1/users/invites/pending"
        ? Promise.resolve({ data: { data: { pending } } })
        : Promise.resolve({ data: { data: { users: rows, nextCursor: null, total: 2 } } }),
    );

  it("offers New member", async () => {
    useSessionStore.setState(superSession);
    routeGets(0);
    renderWithProviders(<UsersScreen />);
    fireEvent.press(await screen.findByText("New member"));
    expect(mockPush).toHaveBeenCalledWith("/users/new");
  });

  it("offers SUPER a way into the importer (v1 calls it Import profiles)", async () => {
    useSessionStore.setState(superSession);
    routeGets(0);
    renderWithProviders(<UsersScreen />);
    fireEvent.press(await screen.findByText("Add students in bulk"));
    expect(mockPush).toHaveBeenCalledWith("/users/import");
  });

  it("hides the bulk card at zero pending (R87)", async () => {
    useSessionStore.setState(superSession);
    routeGets(0);
    renderWithProviders(<UsersScreen />);
    await screen.findByText("Active Ann");
    expect(screen.queryByText(/^Send \d+ invites?$/)).toBeNull();
  });

  it("sends one batch after a confirm and reports the four counters", async () => {
    useSessionStore.setState(superSession);
    routeGets(3);
    post.mockResolvedValue({ data: { data: { sent: 2, skipped: 0, failed: 1, remaining: 1 } } });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Send")?.onPress?.();
    });
    renderWithProviders(<UsersScreen />);

    fireEvent.press(await screen.findByText("Send 3 invites"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/users/invites/pending", undefined, {
        timeout: 60_000,
      }),
    );
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith("Invites sent", "Sent 2 · failed 1 · skipped 0 · 1 still pending."),
    );
    alert.mockRestore();
  });
});

// Owner 2026-11-07: the filters live in a sheet behind the icon in the search row.
const openFilters = () => fireEvent.press(screen.getByLabelText(/^Filter/));
const option = (label: string) => screen.getByLabelText(new RegExp(`^${label}(, Selected)?$`));
const picked = (label: string) => String(option(label).props.accessibilityLabel).endsWith("Selected");

describe("CommunityScreen — status filter and rows", () => {
  const usersUrls = () =>
    get.mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith("/api/v1/users?") || u === "/api/v1/users");

  beforeEach(() => {
    useSessionStore.setState(superSession);
    get.mockImplementation((url: string) =>
      url === "/api/v1/users/invites/pending"
        ? Promise.resolve({ data: { data: { pending: 0 } } })
        : Promise.resolve({ data: { data: { users: rows, nextCursor: null, total: 2 } } }),
    );
  });

  it("opens on 'No invite' and asks for status=pending when Today links with ?status=pending", async () => {
    mockParams = { status: "pending" };
    renderWithProviders(<UsersScreen />);
    await screen.findByText("Active Ann");
    expect(screen.getByLabelText("Filter, 1 active")).toBeTruthy();
    openFilters();
    expect(picked("No invite yet")).toBe(true);
    expect(picked("Any")).toBe(false);
    expect(usersUrls()).toEqual(["/api/v1/users?status=pending"]);
  });

  // Owner 2026-11-07: the Community tab narrows by role as well as by account.
  it("narrows to one role, and back to everyone", async () => {
    renderWithProviders(<UsersScreen />);
    await screen.findByText("Active Ann");
    openFilters();
    expect(picked("Everyone")).toBe(true);
    fireEvent.press(option("Mentors"));
    await waitFor(() => expect(usersUrls()).toContain("/api/v1/users?role=MENTOR"));
    expect(picked("Mentors")).toBe(true);
    fireEvent.press(option("Everyone"));
    expect(picked("Everyone")).toBe(true);
    fireEvent.press(screen.getByText("Done"));
    expect(screen.getByText("2 members")).toBeTruthy();
  });

  it("ignores an unknown status param", async () => {
    mockParams = { status: "bogus" };
    renderWithProviders(<UsersScreen />);
    await screen.findByText("Active Ann");
    expect(usersUrls()).toEqual(["/api/v1/users"]);
  });

  it("clearing to Any refetches without a status", async () => {
    mockParams = { status: "pending" };
    renderWithProviders(<UsersScreen />);
    await screen.findByText("Active Ann");
    openFilters();
    fireEvent.press(option("Any"));
    await waitFor(() => expect(usersUrls()).toContain("/api/v1/users"));
    fireEvent.press(option("Inactive"));
    await waitFor(() => expect(usersUrls()).toContain("/api/v1/users?status=inactive"));
  });

  it("draws a row as avatar, name over email, role and last login, with a status chip and chevron", async () => {
    renderWithProviders(<UsersScreen />);
    const ann = await screen.findByLabelText(/^Active Ann, ann@jpc.test\sAdmin · Last login/);
    expect(ann).toBeTruthy();
    expect(screen.getByLabelText(/^Pending Pete, pete@jpc.test\sStudent · Never signed in, No invite$/)).toBeTruthy();
    expect(screen.getAllByTestId("list-row-chevron", { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the email on its own line and gives the meta room (no stranded dot, no cut date)", async () => {
    renderWithProviders(<UsersScreen />);
    const email = await screen.findByText("ann@jpc.test");
    expect(email.props.numberOfLines).toBe(1);
    const meta = screen.getByText(/^Admin · Last login/);
    expect(meta.props.numberOfLines).toBeGreaterThanOrEqual(3);
    // the date never splits across lines
    expect(meta.props.children).toMatch(/Last login \w{3}\u00a0\d{1,2},\u00a0\d{4}$/);
  });

  it("shows the email once, as the title, for a user with no name", async () => {
    const nameless = { ...rows[1]!, id: 7, name: "", email: "nobody@jpc.test", lastLoginAt: null };
    get.mockImplementation((url: string) =>
      url === "/api/v1/users/invites/pending"
        ? Promise.resolve({ data: { data: { pending: 0 } } })
        : Promise.resolve({ data: { data: { users: [nameless], nextCursor: null, total: 1 } } }),
    );
    renderWithProviders(<UsersScreen />);
    await screen.findByText("nobody@jpc.test");
    expect(screen.getAllByText(/nobody@jpc.test/)).toHaveLength(1);
    expect(screen.getByText("Student · Never signed in")).toBeTruthy();
  });

  it("puts Send N invites and Import profiles above the list as chevron rows", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/users/invites/pending"
        ? Promise.resolve({ data: { data: { pending: 1 } } })
        : Promise.resolve({ data: { data: { users: rows, nextCursor: null, total: 2 } } }),
    );
    renderWithProviders(<UsersScreen />);
    expect(await screen.findByText("Send 1 invite")).toBeTruthy();
    expect(screen.getByText("Add students in bulk")).toBeTruthy();
    expect(screen.getAllByTestId("list-row-chevron", { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(2);
  });
});
