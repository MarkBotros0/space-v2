import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
const mockLogout = jest.fn();
jest.mock("../hooks/use-session", () => ({ useLogout: () => mockLogout }));
const mockPageTitle = jest.fn();
jest.mock("../design/layout/page-title", () => ({
  ...jest.requireActual("../design/layout/page-title"),
  PageTitle: (props: unknown) => {
    mockPageTitle(props);
    return null;
  },
}));

import type { MyProfile } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { AccountProfile } from "../screens/profile/account-profile";
import { AlumniProfile } from "../screens/profile/alumni-profile";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

const get = apiClient.get as jest.Mock;

const profile: MyProfile = {
  name: "Alumni Person",
  email: "alumni@jpc.test",
  avatarPath: null,
  graduationYear: 2025,
  activeSeasonTitle: null,
  university: "Cairo University",
  faculty: null,
  universityGraduationYear: null,
  phone: null,
  dateOfBirth: null,
};

function serveProfile(p: Partial<MyProfile> | null = {}) {
  get.mockImplementation(() =>
    p === null
      ? Promise.reject(new Error("boom"))
      : Promise.resolve({ data: { data: { profile: { ...profile, ...p } } } }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AccountProfile", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("MENTOR", {}, { name: "Mona Mentor", email: "mona@jpc.test" }));
  });

  it("titles the screen on Screen and shows the identity card", () => {
    renderWithProviders(<AccountProfile />);
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(mockPageTitle).not.toHaveBeenCalled();
    expect(screen.getByText("Mona Mentor")).toBeTruthy();
    expect(screen.getByText("mona@jpc.test")).toBeTruthy();
  });

  it("pushes Profile settings and Notifications (Notification settings is not here) from grouped rows", () => {
    renderWithProviders(<AccountProfile />);
    fireEvent.press(screen.getByRole("button", { name: "Profile settings" }));
    expect(mockPush).toHaveBeenLastCalledWith("/settings/profile");
    expect(screen.queryByRole("button", { name: "Notification settings" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Notifications" }));
    expect(mockPush).toHaveBeenLastCalledWith("/notifications");
  });

  it("signs out", () => {
    renderWithProviders(<AccountProfile />);
    fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe("AlumniProfile", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2025 }));
  });

  it("shows the read-only record", async () => {
    serveProfile();
    renderWithProviders(<AlumniProfile />);
    expect(await screen.findByText("Alumni Person")).toBeTruthy();
    expect(screen.getByText("Your alumni record")).toBeTruthy();
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(mockPageTitle).not.toHaveBeenCalled();
    for (const label of ["Name", "Email", "University", "Status"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("alumni@jpc.test")).toBeTruthy();
    expect(screen.getByText("Cairo University")).toBeTruthy();
    expect(screen.getByText("Alumnus · School of 2025")).toBeTruthy();
    expect(screen.getByText("To update your details, please contact the JPC team.")).toBeTruthy();
  });

  it("puts the Status chip above its label, like the other rows' value over label", async () => {
    serveProfile({});
    renderWithProviders(<AlumniProfile />);
    const chip = await screen.findByText("Alumnus · School of 2025");
    const order = (n: unknown): string[] =>
      typeof n === "string" ? [n] : ((n as { children?: unknown[] })?.children ?? []).flatMap(order);
    const texts = order(screen.toJSON());
    expect(texts.indexOf("Status")).toBeGreaterThan(texts.indexOf("Alumnus · School of 2025"));
    expect(chip).toBeTruthy();
  });

  it("shows a dash for a missing university", async () => {
    serveProfile({ university: null });
    renderWithProviders(<AlumniProfile />);
    expect(await screen.findByText("—")).toBeTruthy();
  });

  it("has nothing to press or edit", async () => {
    serveProfile();
    renderWithProviders(<AlumniProfile />);
    await screen.findByText("Alumni Person");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.UNSAFE_queryAllByType(require("react-native").TextInput)).toHaveLength(0);
  });

  it("shows a skeleton while loading", () => {
    get.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AlumniProfile />);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });

  it("offers a retry on error", async () => {
    serveProfile(null);
    renderWithProviders(<AlumniProfile />);
    fireEvent.press(await screen.findByText("Try again"));
    expect(get).toHaveBeenCalledTimes(2);
  });
});
