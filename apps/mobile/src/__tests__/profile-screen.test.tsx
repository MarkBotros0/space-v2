import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), patch: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock("../hooks/use-session", () => ({ useLogout: () => mockLogout }));

import type { MyProfile } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import ProfileScreen from "../../app/(app)/profile";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const profile: MyProfile = {
  name: "Mina Adel",
  email: "mina@jpc.test",
  avatarPath: null,
  graduationYear: null,
  activeSeasonTitle: "GBV 2026",
  university: "Cairo University",
  year: null,
  phone: "+20 100",
  dateOfBirth: "2001-04-05",
  spiritualBackground: null,
  gifts: null,
};

const attendance = {
  season: { id: 7, title: "GBV 2026", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: { minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 },
  streak: 3,
  sessions: [],
};

function routeGets(p: typeof profile = profile) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/me/profile") return Promise.resolve({ data: { data: { profile: p } } });
    if (url === "/api/v1/me/attendance") return Promise.resolve({ data: { data: attendance } });
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
    expect(await screen.findByText("Absence budget left")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("Streak")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByLabelText("University").props.value).toBe("Cairo University");
    expect(screen.getByLabelText("Date of birth (YYYY-MM-DD)").props.value).toBe("2001-04-05");
    // Decision 1: no name or email field on this screen.
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("saves through PATCH /me/profile with the six fields only", async () => {
    patch.mockResolvedValue({ data: { data: { profile: { ...profile, phone: "+20 122" } } } });
    renderWithProviders(<ProfileScreen />);

    fireEvent.changeText(await screen.findByLabelText("Phone"), "+20 122");
    fireEvent.press(screen.getByText("Save profile"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/me/profile", {
        university: "Cairo University",
        year: "",
        phone: "+20 122",
        dateOfBirth: "2001-04-05",
        spiritualBackground: "",
        gifts: "",
      }),
    );
    expect(await screen.findByText("Profile saved.")).toBeTruthy();
  });

  it("validates with the server's schema before sending — an impossible date never leaves", async () => {
    renderWithProviders(<ProfileScreen />);

    fireEvent.changeText(await screen.findByLabelText("Date of birth (YYYY-MM-DD)"), "2001-02-30");
    fireEvent.press(screen.getByText("Save profile"));

    await waitFor(() =>
      expect(screen.getByLabelText("Date of birth (YYYY-MM-DD)").props.accessibilityHint).toBe("Not a real calendar day."),
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it("treats a response carrying notes as a failed save (X10, R23)", async () => {
    patch.mockResolvedValue({ data: { data: { profile: { ...profile, notes: "internal" } } } });
    renderWithProviders(<ProfileScreen />);

    fireEvent.press(await screen.findByText("Save profile"));

    expect(await screen.findByText("Couldn't save your profile.")).toBeTruthy();
  });

  it("sends name changes to Settings (PATCH /me owns User.name)", async () => {
    renderWithProviders(<ProfileScreen />);

    fireEvent.press(await screen.findByText("Open settings"));

    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("shows no stats and runs no attendance query without an active season", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { name: "Mina Adel" }));
    renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("Mina Adel")).toBeTruthy();
    expect(screen.queryByText("Absence budget left")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/me/attendance");
  });
});

describe("ProfileScreen — ALUMNI", () => {
  it("is a read-only record with no form and no attendance query", async () => {
    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2024 }));
    routeGets({ ...profile, graduationYear: 2024, activeSeasonTitle: null });

    renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("Alumnus · Class of 2024")).toBeTruthy();
    expect(screen.getByText("Cairo University")).toBeTruthy();
    expect(screen.getByText("To update your details, please contact the JPC team.")).toBeTruthy();
    expect(screen.queryByText("Save profile")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/me/attendance");
  });
});

describe("ProfileScreen — MENTOR (Decision 2)", () => {
  it("is the account card with Settings and Sign out, and calls no student endpoint", async () => {
    useSessionStore.setState(makeSession("MENTOR", {}, { name: "Maged Mentor", email: "maged@jpc.test" }));

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
