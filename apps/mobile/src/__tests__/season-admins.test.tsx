import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "s7" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), dismissAll: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { toast } from "../design/ui/toaster";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const del = apiClient.delete as jest.Mock;

const SIGN_OUT = "They'll be signed out and need to sign in again.";

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
const pat = { userId: 21, name: "Pat Admin", email: "pat@jpc.test", assignedAt: "2099-01-02T00:00:00.000Z", assignedByName: "Su" };
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

let adminsFail: boolean;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  adminsFail = false;
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: detail } });
    if (url === "/api/v1/seasons/7/sessions") return Promise.resolve({ data: { data: { sessions: [] } } });
    if (url === "/api/v1/seasons/7/admins")
      return adminsFail ? Promise.reject(new Error("boom")) : Promise.resolve({ data: { data: { admins: [pat] } } });
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

describe("Admins section", () => {
  it("is shown on a SUPER's season overview and not on an ADMIN's", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const view = renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("ADMINS")).toBeTruthy();
    view.unmount();

    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Save changes")).toBeTruthy();
    expect(screen.queryByText("ADMINS")).toBeNull();
  });

  it("the picker excludes current admins and deactivated users", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("Pat Admin");
    await waitFor(() => expect(screen.getByLabelText("Choose an admin")).not.toBeDisabled());
    fireEvent.press(screen.getByLabelText("Choose an admin"));
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByText("Rana Admin")).toBeTruthy();
    expect(screen.queryByText("Gone Admin")).toBeNull();
  });

  it("adding asks first, saying the person is signed out, then POSTs and toasts", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({
      data: { data: { admins: [pat, { ...pat, userId: 22, name: "Rana Admin", email: "rana@jpc.test" }] } },
    });
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("Pat Admin");
    await waitFor(() => expect(screen.getByLabelText("Choose an admin")).not.toBeDisabled());
    fireEvent.press(screen.getByLabelText("Choose an admin"));
    fireEvent.press(screen.getByText("Rana Admin"));
    fireEvent.press(screen.getByText("Add admin"));

    expect(screen.getByText("Add admin?")).toBeTruthy();
    expect(screen.getByText(`Rana Admin will be able to administer TEST 2099. ${SIGN_OUT}`)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Add"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/admins", { userId: 22 }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Rana Admin can now administer TEST 2099."));
  });

  it("cancelling the add dialog sends nothing", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("Pat Admin");
    await waitFor(() => expect(screen.getByLabelText("Choose an admin")).not.toBeDisabled());
    fireEvent.press(screen.getByLabelText("Choose an admin"));
    fireEvent.press(screen.getByText("Rana Admin"));
    fireEvent.press(screen.getByText("Add admin"));
    fireEvent.press(screen.getByText("Cancel"));
    expect(post).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Add admin?")).toBeNull());
  });

  it("removing goes through the confirm dialog, saying the person is signed out", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    del.mockResolvedValue({ data: { data: { admins: [] } } });
    renderWithProviders(<SeasonDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Remove Pat Admin"));
    expect(screen.getByText("Remove admin?")).toBeTruthy();
    expect(
      screen.getByText(`Pat Admin will no longer be able to administer TEST 2099. ${SIGN_OUT}`),
    ).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Remove"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/7/admins/21"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pat Admin was removed as an admin."));
  });

  it("a failed load offers Try again, which asks again", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    adminsFail = true;
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Couldn't load the admins.")).toBeTruthy();
    const calls = () => get.mock.calls.filter(([u]) => u === "/api/v1/seasons/7/admins").length;
    const before = calls();
    adminsFail = false;
    fireEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(calls()).toBeGreaterThan(before));
    expect(await screen.findByText("Pat Admin")).toBeTruthy();
  });
});
