import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import StudentDetailScreen from "../../app/(app)/student/[id]/index";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const enrollment = (seasonId: number) => ({
  enrollmentId: 500 + seasonId,
  seasonId,
  seasonCode: `S${seasonId}`,
  seasonTitle: `Season ${seasonId}`,
  seasonStatus: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  groupName: null,
  status: "ACTIVE" as const,
  enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null,
  droppedAt: null,
  dropReason: null,
  attendancePct: null,
});
const publicProfile = {
  university: null, year: null, gifts: null,
  activeSeasonId: 7, activeSeasonTitle: "Season 7", activeSeasonCode: "S7",
};
const detail = {
  id: 21, name: "Sara Student", email: "sara@jpc.test", avatarPath: null,
  graduationYear: null, currentGroup: null, enrollments: [enrollment(7)],
  profile: {
    ...publicProfile, phone: "+20 111", dateOfBirth: null,
    spiritualBackground: "Raised Orthodox", notes: "Watch attendance",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/students/21") return Promise.resolve({ data: { data: detail } });
    if (url.endsWith("/notes")) return Promise.resolve({ data: { data: { notes: [], nextCursor: null } } });
    return Promise.reject({
      isAxiosError: true,
      response: { status: 404, data: { error: { code: "no_season", message: "x" } } },
    });
  });
});

describe("admin student detail", () => {
  it("shows every staff profile field, mail and call", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("Raised Orthodox")).toBeTruthy();
    expect(screen.getByText("Watch attendance")).toBeTruthy();
    expect(screen.getByText("+20 111")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText("Call")).toBeTruthy();
  });

  it("gives ADMIN of the season Edit and Drop, not Graduate or Delete", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByText("Edit profile");
    expect(screen.queryByText("Graduate")).toBeNull();
    expect(screen.queryByText("Delete student")).toBeNull();
    expect(screen.getByText("Drop")).toBeTruthy();
  });

  it("fetches a section only when it is first opened", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByText("Edit profile");
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/notes");
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/attendance");
    fireEvent.press(screen.getByText("Notes"));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students/21/notes"));
  });

  it("drops with the same body and keeps its save bar in the sheet", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    patch.mockResolvedValue({ data: { data: { id: 507 } } });
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Seasons"));
    fireEvent.press(await screen.findByText("Drop"));
    expect(screen.getByTestId("sheet-save-bar")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Reason"), "x".repeat(501));
    fireEvent.press(within(screen.getByTestId("sheet-save-bar")).getByText("Drop student"));
    expect(within(screen.getByTestId("sheet-save-bar")).getByText("At most 500 characters.")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText("Reason"), "Moved");
    fireEvent.press(within(screen.getByTestId("sheet-save-bar")).getByText("Drop student"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/students/21/enrollments/7", {
        status: "WITHDRAWN",
        dropReason: "Moved",
      }),
    );
  });

  it("MENTOR keeps the existing component: no actions", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    get.mockImplementation((url: string) =>
      url === "/api/v1/students/21"
        ? Promise.resolve({ data: { data: { ...detail, profile: publicProfile } } })
        : Promise.reject(new Error("x")),
    );
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByText("Seasons");
    expect(screen.queryByText("Edit profile")).toBeNull();
    expect(screen.queryByTestId("sheet-save-bar")).toBeNull();
  });
});
