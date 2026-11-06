import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

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

const person = (id: number, name: string) => ({ id, name, lastSeason: { title: "GBV 2025" } });
const candidates = (...people: ReturnType<typeof person>[]) => Promise.resolve({ data: { data: { people } } });

let admins: (typeof pat)[];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  admins = [pat];
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: detail } });
    if (url === "/api/v1/seasons/7/sessions") return Promise.resolve({ data: { data: { sessions: [] } } });
    if (url === "/api/v1/seasons/7/admins") return Promise.resolve({ data: { data: { admins } } });
    if (url === "/api/v1/seasons/7/staff-candidates")
      return candidates(person(21, "Pat Admin"), person(22, "Rana Admin"));
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

describe("Admins card on the SUPER season detail", () => {
  it("lists the admins and offers the staff candidates who aren't one yet", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<SeasonDetailScreen />);

    expect(await screen.findByText("Pat Admin")).toBeTruthy();
    expect(screen.getByText("pat@jpc.test")).toBeTruthy();

    fireEvent.press(screen.getByText("Add admin"));
    expect(await screen.findByText("Rana Admin")).toBeTruthy();
    // Pat is one already: only in the card.
    expect(screen.getAllByText("Pat Admin")).toHaveLength(1);
  });

  it("a person who leaves the list during the question does not leave the dialog armed for the next pick (final review M10)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: detail } });
      if (url === "/api/v1/seasons/7/sessions") return Promise.resolve({ data: { data: { sessions: [] } } });
      if (url === "/api/v1/seasons/7/admins") return Promise.resolve({ data: { data: { admins } } });
      if (url === "/api/v1/seasons/7/staff-candidates")
        return candidates(person(21, "Pat Admin"), person(22, "Rana Admin"), person(24, "Sam Admin"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    let client: QueryClient | undefined;
    const mount = QueryClient.prototype.mount;
    jest.spyOn(QueryClient.prototype, "mount").mockImplementation(function (this: QueryClient) {
      client = this;
      return mount.call(this);
    });
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("Pat Admin");
    fireEvent.press(screen.getByText("Add admin"));
    fireEvent.press(await screen.findByText("Rana Admin"));
    expect(screen.getByText("Add admin?")).toBeTruthy();

    // Someone else makes Rana an admin: she leaves the list while her dialog is open.
    const rana = { ...pat, userId: 22, name: "Rana Admin", email: "rana@jpc.test" };
    act(() => client!.setQueryData(queryKeys.seasons.admins(7), [pat, rana]));
    await waitFor(() => expect(screen.queryByText("Add admin?")).toBeNull());

    fireEvent.press(await screen.findByText("Sam Admin"));
    expect(screen.getByText("Sam Admin will be able to administer TEST 2099.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("adds the tapped admin, toasts, and refreshes the season, users and dashboard", async () => {
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
    fireEvent.press(screen.getByText("Add admin"));
    fireEvent.press(await screen.findByText("Rana Admin"));
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

  it("shows the server's refusal in the sheet", async () => {
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
    fireEvent.press(screen.getByText("Add admin"));
    fireEvent.press(await screen.findByText("Rana Admin"));
    fireEvent.press(screen.getByText("Add"));

    expect(await screen.findByText("Only a user with the ADMIN role can administer a season.")).toBeTruthy();
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
    expect(screen.getByText("Pat Admin will no longer be able to administer TEST 2099.")).toBeTruthy();
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
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/staff-candidates");
  });
});
