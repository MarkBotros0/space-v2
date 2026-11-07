import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), patch: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock("../hooks/use-session", () => ({ useLogout: () => mockLogout }));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

import type { MyProfile } from "@space/shared";

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import ProfileScreen from "../../app/(app)/(tabs)/profile";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const profile: MyProfile = {
  name: "Mina Adel",
  email: "mina@jpc.test",
  avatarPath: null,
  graduationYear: null,
  activeSeasonTitle: "GBV 2026",
  university: "Cairo University",
  faculty: null,
  universityGraduationYear: null,
  phone: "+20 100",
  dateOfBirth: "2001-04-05",
};

const attendance = {
  season: { id: 7, title: "GBV 2026", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: {
    minutesUsed: 105,
    budgetMinutes: 180,
    budgetPct: 58,
    remainingPct: 42,
    absentCount: 1,
    lateCount: 1,
  },
  streak: 3,
  sessions: [],
};

const selfEngagement = {
  attendancePct: 62,
  submissionPct: 25,
  attendanceTotal: 8,
  attendancePresent: 5,
  submissionsExpected: 4,
  submissionsCompleted: 1,
  seasonId: 7,
  seasonTitle: "GBV 2026",
};

function routeGets(p: typeof profile = profile) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/me/profile") return Promise.resolve({ data: { data: { profile: p } } });
    if (url === "/api/v1/me/attendance") return Promise.resolve({ data: { data: attendance } });
    if (url === "/api/v1/students/1/engagement")
      return Promise.resolve({ data: { data: selfEngagement } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("ProfileScreen — STUDENT", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Mina Adel" }));
    routeGets();
  });

  it("shows identity, the correctly labelled budget figure, the streak, and the editable fields", async () => {
    renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("Mina Adel")).toBeTruthy();
    expect(screen.getByText("MA")).toBeTruthy(); // initials — no avatar read path in v2
    expect(screen.getByText("mina@jpc.test")).toBeTruthy();
    // Spec 19 D14 / spec 09 R68: the server's remainingPct, under a label that says what it is.
    expect(await screen.findByLabelText("Absence budget left: 42%")).toBeTruthy();
    expect(await screen.findByLabelText("Streak: 3")).toBeTruthy();
    expect(screen.getByLabelText("University").props.value).toBe("Cairo University");
    // Phone and date of birth moved to Settings → Profile details (owner, 2026-11-06).
    expect(screen.queryByLabelText("Date of birth")).toBeNull();
    expect(screen.queryByLabelText("Phone")).toBeNull();
    // The student's own engagement (self arm): completed / expected.
    expect(await screen.findByLabelText("Assignments: 1/4")).toBeTruthy();
    expect(screen.getByText("YOUR DETAILS")).toBeTruthy();
    // Decision 1: no name or email field on this screen.
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("lays the figures out as a pair, then Streak at half width: never an orphan full-width tile", async () => {
    renderWithProviders(<ProfileScreen />);

    const pair = await screen.findByTestId("profile-figures-pair");
    expect(within(pair).getByLabelText(/^Absence budget left/)).toBeTruthy();
    expect(within(pair).getByLabelText(/^Assignments/)).toBeTruthy();
    const last = screen.getByTestId("profile-figures-last");
    expect(within(last).getByLabelText(/^Streak/)).toBeTruthy();
    // The empty half keeps Streak the width of one column.
    expect(within(last).getByTestId("profile-figures-spacer")).toBeTruthy();
  });

  it("pins Save changes in the screen footer, not among the fields", async () => {
    renderWithProviders(<ProfileScreen />);

    await screen.findByLabelText("University");
    expect(within(screen.getByTestId("screen-footer")).getByText("Save changes")).toBeTruthy();
    expect(within(screen.getByTestId("screen-scroll")).queryByText("Save changes")).toBeNull();
  });

  it("saves through PATCH /me/profile with its three academic fields only", async () => {
    patch.mockResolvedValue({
      data: { data: { profile: { ...profile, faculty: "Engineering" } } },
    });
    renderWithProviders(<ProfileScreen />);

    fireEvent.changeText(await screen.findByLabelText("Faculty"), "Engineering");
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/me/profile", {
        university: "Cairo University",
        faculty: "Engineering",
        universityGraduationYear: null,
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Profile saved."));
  });

  it("enables Save only while something differs from what is saved", async () => {
    patch.mockResolvedValue({ data: { data: { profile: { ...profile, faculty: "Arts" } } } });
    renderWithProviders(<ProfileScreen />);
    const phone = await screen.findByLabelText("Faculty");
    const save = () => screen.getByRole("button", { name: "Save changes" });

    expect(save().props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(phone, "Arts");
    expect(save().props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.changeText(phone, "");
    expect(save().props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(phone, "Arts");
    fireEvent.press(save());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Profile saved."));
    await waitFor(() => expect(save().props.accessibilityState?.disabled).toBe(true));
  });

  it("sends the graduation year as a number", async () => {
    patch.mockResolvedValue({
      data: { data: { profile: { ...profile, universityGraduationYear: 2028 } } },
    });
    renderWithProviders(<ProfileScreen />);

    fireEvent.changeText(await screen.findByLabelText("Graduation year"), "2028");
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/me/profile",
        expect.objectContaining({ universityGraduationYear: 2028 }),
      ),
    );
  });

  it("treats a response carrying notes as a failed save (X10, R23)", async () => {
    patch.mockResolvedValue({ data: { data: { profile: { ...profile, notes: "internal" } } } });
    renderWithProviders(<ProfileScreen />);

    fireEvent.changeText(await screen.findByLabelText("Faculty"), "Arts");
    fireEvent.press(screen.getByText("Save changes"));

    expect(await screen.findByText("Couldn't save your profile.")).toBeTruthy();
  });

  it("sends name, phone, birthday and address to Profile details (PATCH /me owns them)", async () => {
    renderWithProviders(<ProfileScreen />);

    fireEvent.press(await screen.findByText("Profile details"));

    expect(mockPush).toHaveBeenCalledWith("/settings/profile");
  });

  it("shows no stats and runs no attendance query without an active season", async () => {
    useSessionStore.setState(
      makeSession("STUDENT", { activeSeasonId: null }, { name: "Mina Adel" }),
    );
    renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("Mina Adel")).toBeTruthy();
    expect(screen.queryByText("Absence budget left")).toBeNull();
    expect(screen.queryByText("Assignments")).toBeNull();
    expect(screen.queryByText("Streak")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/me/attendance");
  });
});

describe("ProfileScreen — ALUMNI", () => {
  it("is a read-only record with no form and no attendance query", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null, graduationYear: 2024 }));
    routeGets({ ...profile, graduationYear: 2024, activeSeasonTitle: null });

    renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("Alumnus · School of 2024")).toBeTruthy();
    expect(screen.getByText("Cairo University")).toBeTruthy();
    expect(screen.getByText("To update your details, please contact the JPC team.")).toBeTruthy();
    expect(screen.queryByText("Save profile")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/me/attendance");
  });
});

describe("ProfileScreen — MENTOR (Decision 2)", () => {
  it("is the account card with Settings and Sign out, and calls no student endpoint", async () => {
    useSessionStore.setState(
      makeSession("MENTOR", {}, { name: "Maged Mentor", email: "maged@jpc.test" }),
    );

    renderWithProviders(<ProfileScreen />);

    expect(screen.getByText("Maged Mentor")).toBeTruthy();
    expect(screen.getByText("MM")).toBeTruthy();
    expect(screen.getByText("MENTOR")).toBeTruthy();
    fireEvent.press(screen.getByText("Settings"));
    expect(mockPush).toHaveBeenCalledWith("/settings");
    fireEvent.press(screen.getByText("Sign out"));
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    expect(get).not.toHaveBeenCalled();
  });
});
