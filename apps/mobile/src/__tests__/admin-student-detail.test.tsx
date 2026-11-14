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
import { toast } from "../design/ui/toaster";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import StudentDetailScreen from "../../app/(app)/student/[id]/index";
import { expectQuietSuccess } from "./helpers/quiet-success";

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
  phone: null,
  university: null,
  faculty: null,
  universityGraduationYear: null,
  activeSeasonId: 7,
  activeSeasonTitle: "Season 7",
  activeSeasonCode: "S7",
};
const detail = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  graduationYear: null,
  currentGroup: null,
  enrollments: [enrollment(7)],
  profile: {
    ...publicProfile,
    faculty: "Engineering",
    universityGraduationYear: 2027,
    phone: "+20 111",
    dateOfBirth: null,
    notes: "Watch attendance",
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
  it("shows every staff profile field and call, never email", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("Engineering")).toBeTruthy();
    expect(screen.getByText("2027")).toBeTruthy();
    expect(screen.queryByText("Spiritual background")).toBeNull();
    expect(screen.getByText("Watch attendance")).toBeTruthy();
    expect(screen.getByText("+20 111")).toBeTruthy();
    expect(screen.queryByText("Email")).toBeNull();
    expect(screen.getByText("Call")).toBeTruthy();
  });

  it("gives ADMIN of the season Edit and Drop, not Graduate or Delete", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByLabelText("Edit profile");
    expect(screen.queryByText("Graduate")).toBeNull();
    expect(screen.queryByText("Delete student")).toBeNull();
    // Drop sits on the Seasons tab, last since 2026-11-07.
    fireEvent.press(screen.getByRole("tab", { name: "Seasons" }));
    expect(await screen.findByText("Drop")).toBeTruthy();
  });

  // Owner 2026-11-07: Submissions, Attendance, Notes, Seasons; the first opens.
  it("orders the sections Work, Attendance, Notes, Seasons (owner 2026-11-14)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByLabelText("Edit profile");
    const names = new Set(["Work", "Attendance", "Notes", "Seasons"]);
    const tabs = screen
      .getAllByRole("tab")
      .map((b) => b.props.accessibilityLabel as string)
      .filter((label) => names.has(label));
    expect(tabs).toEqual(["Work", "Attendance", "Notes", "Seasons"]);
    // Work reads the season progress, not the essay list.
    expect(get).toHaveBeenCalledWith("/api/v1/students/21/progress");
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/submissions");
  });

  it("fetches a section only when it is first opened", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByLabelText("Edit profile");
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

  it("offers Remove instead of Drop on a draft, confirms and refreshes", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const del = apiClient.delete as jest.Mock;
    del.mockResolvedValue({ data: { data: { removed: true } } });
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/students/21") {
        return Promise.resolve({
          data: { data: { ...detail, enrollments: [{ ...enrollment(8), seasonStatus: "DRAFT" }] } },
        });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Seasons"));
    expect(screen.queryByText("Drop")).toBeNull();
    fireEvent.press(await screen.findByLabelText("Remove from Season 8"));
    expect(screen.getByText("Remove from season?")).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getAllByText("Remove").at(-1)!);
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/8/enrollments/21"));
    await expectQuietSuccess();
  });

  it("says the server's reason when Remove is refused", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const del = apiClient.delete as jest.Mock;
    const { AxiosError } = jest.requireActual("axios");
    del.mockRejectedValue(
      new AxiosError("bad", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        data: { error: { code: "has_work", message: "This person already has work." } },
      }),
    );
    get.mockImplementation((url: string) =>
      url === "/api/v1/students/21"
        ? Promise.resolve({ data: { data: { ...detail, enrollments: [{ ...enrollment(8), seasonStatus: "DRAFT" }] } } })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Seasons"));
    fireEvent.press(await screen.findByLabelText("Remove from Season 8"));
    fireEvent.press(screen.getAllByText("Remove").at(-1)!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This person already has work."));
  });

  it("a season admin's own record parses as the private view, with no staff notes", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 21 }));
    const { notes: _notes, ...privateProfile } = detail.profile;
    get.mockImplementation((url: string) =>
      url === "/api/v1/students/21"
        ? Promise.resolve({ data: { data: { ...detail, profile: privateProfile } } })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("Engineering")).toBeTruthy();
    expect(screen.queryByText("Internal notes")).toBeNull();
  });

  it("MENTOR gets their own page: no actions", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    get.mockImplementation((url: string) =>
      url === "/api/v1/students/21"
        ? Promise.resolve({ data: { data: { ...detail, profile: publicProfile } } })
        : Promise.reject(new Error("x")),
    );
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByRole("tab", { name: "Notes" });
    expect(screen.queryByLabelText("Edit profile")).toBeNull();
    expect(screen.queryByTestId("sheet-save-bar")).toBeNull();
    // A mentor sees nothing season-shaped (mentor.md): no progress card, and nothing asked.
    expect(screen.queryByText("Season progress")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/progress");
  });

  it("shows Season progress in place of the engagement card", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const progress = {
      seasonId: 7,
      seasonTitle: "Season 7",
      seasonActive: true,
      canMark: true,
      available: { attendance: true, assignments: true, quizzes: false },
      numbers: {
        attendance: { attended: 3, total: 4 },
        assignments: { submitted: 1, total: 2 },
        quizzes: { scored: 0, max: 0 },
      },
      assignments: [],
      quizzes: [],
    };
    const orig = get.getMockImplementation()!;
    get.mockImplementation((url: string) =>
      url === "/api/v1/students/21/progress" ? Promise.resolve({ data: { data: progress } }) : orig(url),
    );
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("Season progress")).toBeTruthy();
    expect(screen.getByLabelText("Attendance 75%, 3 of 4 sessions")).toBeTruthy();
    expect(screen.getByLabelText("Assignments 50%, 1 of 2 submitted")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes, None this season")).toBeTruthy();
    expect(screen.queryByText("THIS SEASON")).toBeNull();
  });
});
