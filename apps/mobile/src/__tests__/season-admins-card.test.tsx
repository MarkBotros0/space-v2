import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "s7" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

import { QueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import { toast } from "../design/ui/toaster";
import { queryKeys } from "../lib/query-keys";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const del = apiClient.delete as jest.Mock;

const detail = {
  id: 7,
  code: "s7",
  title: "TEST 2099",
  program: "TEST",
  year: 2099,
  status: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  description: null,
  sessionCount: 0,
  studentCount: 0,
  absenceBudgetMinutes: 240,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [],
};

const pat = {
  userId: 21,
  name: "Pat Admin",
  email: "pat@jpc.test",
  assignedAt: "2099-01-02T00:00:00.000Z",
  assignedByName: "Su",
};

const userRow = (id: number, name: string, deletedAt: string | null = null) => ({
  id,
  name,
  email: `${name.split(" ")[0]!.toLowerCase()}@jpc.test`,
  role: "ADMIN",
  graduationYear: 2010,
  lastLoginAt: null,
  deletedAt,
  status: deletedAt ? "inactive" : "active",
});

let admins: (typeof pat)[];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  admins = [pat];
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: detail } });
    if (url === "/api/v1/seasons/7/sessions") return Promise.resolve({ data: { data: { sessions: [] } } });
    if (url === "/api/v1/seasons/7/admins") return Promise.resolve({ data: { data: { admins } } });
    if (url === "/api/v1/users?role=ADMIN")
      return Promise.resolve({
        data: {
          data: {
            users: [userRow(21, "Pat Admin"), userRow(22, "Rana Admin"), userRow(23, "Gone Admin", "2099-01-01")],
            nextCursor: null,
            total: 3,
          },
        },
      });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

describe("Admins card on the SUPER season detail", () => {
  it("lists the admins and offers only active ADMIN users who aren't one yet", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<SeasonDetailScreen />);

    expect(await screen.findByText("Pat Admin")).toBeTruthy();
    expect(screen.getByText("pat@jpc.test")).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("Choose an admin")).not.toBeDisabled());

    fireEvent.press(screen.getByLabelText("Choose an admin"));
    const menu = screen.getAllByRole("menuitem");
    expect(menu).toHaveLength(1);
    expect(within(menu[0]!).getByText("Rana Admin")).toBeTruthy();
  });

  it("a pick that disappears during a refetch does not leave the Add dialog armed for the next pick (final review M10)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const base = get.getMockImplementation() as (url: string) => Promise<unknown>;
    get.mockImplementation((url: string) =>
      url === "/api/v1/users?role=ADMIN"
        ? Promise.resolve({
            data: {
              data: {
                users: [userRow(21, "Pat Admin"), userRow(22, "Rana Admin"), userRow(24, "Sam Admin")],
                nextCursor: null,
                total: 3,
              },
            },
          })
        : base(url),
    );
    let client: QueryClient | undefined;
    const mount = QueryClient.prototype.mount;
    jest.spyOn(QueryClient.prototype, "mount").mockImplementation(function (this: QueryClient) {
      client = this;
      return mount.call(this);
    });
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("Pat Admin");
    await waitFor(() => expect(screen.getByLabelText("Choose an admin")).not.toBeDisabled());
    fireEvent.press(screen.getByLabelText("Choose an admin"));
    fireEvent.press(screen.getByText("Rana Admin"));
    fireEvent.press(screen.getByText("Add admin"));
    expect(screen.getByText("Add admin?")).toBeTruthy();

    // Someone else makes Rana an admin: she leaves the options while her dialog is open.
    const rana = { ...pat, userId: 22, name: "Rana Admin", email: "rana@jpc.test" };
    act(() => client!.setQueryData(queryKeys.seasons.admins(7), [pat, rana]));
    await waitFor(() => expect(screen.queryByText("Add admin?")).toBeNull());

    fireEvent.press(screen.getByLabelText("Choose an admin"));
    fireEvent.press(screen.getByText("Sam Admin"));
    expect(screen.queryByText("Add admin?")).toBeNull();
    fireEvent.press(screen.getByText("Add admin"));
    expect(screen.getByText("Add admin?")).toBeTruthy();
  });

  it("adds the picked admin, toasts, and refreshes the season, users and dashboard", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const invalidate = jest.spyOn(QueryClient.prototype, "invalidateQueries");
    const rana = { ...pat, userId: 22, name: "Rana Admin", email: "rana@jpc.test" };
    post.mockImplementation(() => {
      // The server now holds both, so the follow-up refetch agrees.
      admins = [pat, rana];
      return Promise.resolve({ data: { data: { admins } } });
    });
    renderWithProviders(<SeasonDetailScreen />);

    await screen.findByText("Pat Admin");
    await waitFor(() => expect(screen.getByLabelText("Choose an admin")).not.toBeDisabled());
    fireEvent.press(screen.getByLabelText("Choose an admin"));
    fireEvent.press(screen.getByText("Rana Admin"));
    fireEvent.press(screen.getByText("Add admin"));
    fireEvent.press(screen.getByText("Add"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/admins", { userId: 22 }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Rana Admin can now administer TEST 2099."),
    );
    expect(await screen.findByText("rana@jpc.test")).toBeTruthy();
    for (const queryKey of [queryKeys.seasons.all, queryKeys.users.all, queryKeys.dashboard.all]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
    invalidate.mockRestore();
  });

  it("shows the server's refusal as an error toast", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const { AxiosError } = jest.requireActual("axios");
    post.mockRejectedValue(
      new AxiosError("bad", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        data: { error: { code: "not_an_admin", message: "Only a user with the ADMIN role can administer a season." } },
      }),
    );
    renderWithProviders(<SeasonDetailScreen />);

    await screen.findByText("Pat Admin");
    await waitFor(() => expect(screen.getByLabelText("Choose an admin")).not.toBeDisabled());
    fireEvent.press(screen.getByLabelText("Choose an admin"));
    fireEvent.press(screen.getByText("Rana Admin"));
    fireEvent.press(screen.getByText("Add admin"));
    fireEvent.press(screen.getByText("Add"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Only a user with the ADMIN role can administer a season."),
    );
  });

  it("removes an admin only after the confirm dialog", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    del.mockImplementation(() => {
      admins = [];
      return Promise.resolve({ data: { data: { admins } } });
    });
    renderWithProviders(<SeasonDetailScreen />);

    fireEvent.press(await screen.findByLabelText("Remove Pat Admin"));
    expect(screen.getByText("Remove admin?")).toBeTruthy();
    expect(screen.getByText("Pat Admin will no longer be able to administer TEST 2099. They'll be signed out and need to sign in again.")).toBeTruthy();
    expect(del).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Remove"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/7/admins/21"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pat Admin was removed as an admin."));
    expect(await screen.findByText("No admins yet.")).toBeTruthy();
  });

  it("is not shown to a season ADMIN, and never asks for the list", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Save changes")).toBeTruthy();
    expect(screen.queryByText("Admins")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/admins");
    expect(get).not.toHaveBeenCalledWith("/api/v1/users?role=ADMIN");
  });
});
