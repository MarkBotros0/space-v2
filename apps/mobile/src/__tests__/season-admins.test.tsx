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
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
  }),
}));

import { apiClient } from "../lib/api-client";
import { toast } from "../design/ui/toaster";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/admins";
import { expectQuietSuccess } from "./helpers/quiet-success";

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
  assignmentCount: 0,
  quizCount: 0,
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
const person = (id: number, name: string, lastSeason: string | null) => ({
  id,
  name,
  lastSeason: lastSeason === null ? null : { title: lastSeason },
});
const refusal = (message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code: "already_in_role", message } } },
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
    if (url === "/api/v1/seasons/7/staff-candidates")
      return Promise.resolve({
        data: {
          data: {
            people: [
              person(21, "Pat Admin", "GBV 2025"),
              person(22, "Rana Admin", "GBV 2025"),
              person(23, "New Person", null),
            ],
          },
        },
      });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

describe("Admins screen", () => {
  it("the picker lists the staff candidates, minus current admins, with their last season", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("Pat Admin");
    fireEvent.press(screen.getByText("Add admin"));
    expect(await screen.findByText("Rana Admin")).toBeTruthy();
    expect(screen.getByText("GBV 2025")).toBeTruthy();
    expect(screen.getByText("New Person")).toBeTruthy();
    // Pat is already an admin: listed once, in the card, not in the sheet.
    expect(screen.getAllByText("Pat Admin")).toHaveLength(1);
  });

  it("tapping a person asks first, then POSTs and toasts", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({
      data: { data: { admins: [pat, { ...pat, userId: 22, name: "Rana Admin", email: "rana@jpc.test" }] } },
    });
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("Pat Admin");
    fireEvent.press(screen.getByText("Add admin"));
    fireEvent.press(await screen.findByText("Rana Admin"));
    expect(screen.getByText("Add admin?")).toBeTruthy();
    expect(screen.getByText("Rana Admin will be able to administer TEST 2099.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Add"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/admins", { userId: 22 }));
    await expectQuietSuccess();
  });

  it("an already_in_role refusal shows the server's message in the sheet", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockRejectedValue(refusal("Rana is already leading a group in GBV 2026"));
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("Pat Admin");
    fireEvent.press(screen.getByText("Add admin"));
    fireEvent.press(await screen.findByText("Rana Admin"));
    fireEvent.press(screen.getByText("Add"));
    expect(await screen.findByText("Rana is already leading a group in GBV 2026")).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("cancelling the add dialog sends nothing", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<SeasonDetailScreen />);
    await screen.findByText("Pat Admin");
    fireEvent.press(screen.getByText("Add admin"));
    fireEvent.press(await screen.findByText("Rana Admin"));
    fireEvent.press(screen.getByText("Cancel"));
    expect(post).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Add admin?")).toBeNull());
  });

  it("removing goes through the confirm dialog", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    del.mockResolvedValue({ data: { data: { admins: [] } } });
    renderWithProviders(<SeasonDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Remove Pat Admin"));
    expect(screen.getByText("Remove admin?")).toBeTruthy();
    expect(screen.getByText(`Pat Admin will no longer be able to administer TEST 2099.`)).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Remove"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/7/admins/21"));
    await expectQuietSuccess();
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
