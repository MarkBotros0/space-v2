import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock("../hooks/use-session", () => ({ useLogout: () => mockLogout }));

import type { MyProfile } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import ProfileScreen from "../../app/(app)/(tabs)/profile";

const get = apiClient.get as jest.Mock;

const profile: MyProfile = {
  name: "Mina Adel",
  email: "mina@jpc.test",
  avatarPath: null,
  graduationYear: null,
  activeSeasonTitle: "GBV 2026",
  university: "Cairo University",
  faculty: null,
  universityGraduationYear: 2028,
  phone: "01001234567",
  dateOfBirth: "2001-04-05",
};

function serveProfile(p: MyProfile | null = profile) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/me/profile" && p
      ? Promise.resolve({ data: { data: { profile: p } } })
      : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

// Owner 2026-11-07: Profile and Profile settings are one read-only page with Edit,
// no role badge and no season figures.
describe("Profile — student", () => {
  beforeEach(() => {
    useSessionStore.setState(
      makeSession(
        "STUDENT",
        { activeSeasonId: 7 },
        { name: "Mina Adel", email: "mina@jpc.test", phone: "01001234567", dateOfBirth: "2001-04-05", address: null },
      ),
    );
    serveProfile();
  });

  it("shows who they are, their details and their academic record, read-only", async () => {
    renderWithProviders(<ProfileScreen />);
    expect(await screen.findByText("Cairo University")).toBeTruthy();
    expect(screen.getByText("Mina Adel")).toBeTruthy();
    expect(screen.getByText("MA")).toBeTruthy();
    expect(screen.getByText("mina@jpc.test")).toBeTruthy();
    expect(screen.getByText("01001234567")).toBeTruthy();
    expect(screen.getByText("Apr 5, 2001")).toBeTruthy();
    expect(screen.getByText("2028")).toBeTruthy();
    // Faculty and address are empty.
    expect(screen.getAllByText("Not added")).toHaveLength(2);
    expect(screen.UNSAFE_queryAllByType(require("react-native").TextInput)).toHaveLength(0);
  });

  it("has no role badge and no season figures", async () => {
    renderWithProviders(<ProfileScreen />);
    await screen.findByText("Cairo University");
    expect(screen.queryByText("Student")).toBeNull();
    expect(screen.queryByText("Absence budget left")).toBeNull();
    expect(screen.queryByText("Streak")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/me/attendance");
  });

  it("opens Edit profile from the Edit button", async () => {
    renderWithProviders(<ProfileScreen />);
    fireEvent.press(await screen.findByRole("button", { name: "Edit profile" }));
    expect(mockPush).toHaveBeenCalledWith("/edit-profile");
  });

  it("leaves the account actions to More", async () => {
    renderWithProviders(<ProfileScreen />);
    await screen.findByText("Cairo University");
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("shows a skeleton while loading, and a retry on error", async () => {
    get.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderWithProviders(<ProfileScreen />);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    unmount();
    serveProfile(null);
    renderWithProviders(<ProfileScreen />);
    fireEvent.press(await screen.findByText("Try again"));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
  });
});

describe("Profile — alumni", () => {
  it("names their JPC class with the academic record", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null, graduationYear: 2024 }));
    serveProfile({ ...profile, graduationYear: 2024, activeSeasonTitle: null });
    renderWithProviders(<ProfileScreen />);
    expect(await screen.findByText("JPCS-24")).toBeTruthy();
    expect(screen.getByText("Cairo University")).toBeTruthy();
  });
});

describe("Profile — MENTOR (More tab, owner 2026-11-07)", () => {
  it("is read-only identity: the account actions are on More, and no student endpoint is called", () => {
    useSessionStore.setState(makeSession("MENTOR", {}, { name: "Maged Mentor", email: "maged@jpc.test" }));
    renderWithProviders(<ProfileScreen />);
    expect(screen.getByText("Maged Mentor")).toBeTruthy();
    expect(screen.queryByText("MENTOR")).toBeNull();
    expect(screen.queryByText("Academic")).toBeNull();
    expect(screen.queryByText("Notifications")).toBeNull();
    expect(screen.queryByText("Appearance")).toBeNull();
    expect(screen.queryByText("Sign out")).toBeNull();
    expect(screen.queryByText("Delete account")).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("Profile — staff with a More tab", () => {
  it("leaves the account actions to More", () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { name: "Ada Admin" }));
    renderWithProviders(<ProfileScreen />);
    expect(screen.getByText("Ada Admin")).toBeTruthy();
    expect(screen.queryByText("Sign out")).toBeNull();
  });
});
