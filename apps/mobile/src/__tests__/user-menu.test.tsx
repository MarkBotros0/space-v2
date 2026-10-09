import { fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock("../hooks/use-session", () => ({ useLogout: () => mockLogout }));

import { AppTopBar, UserMenu, profileHrefFor } from "../components/UserMenu";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("UserMenu (18-settings R9/R10 — v1's avatar menu, every role)", () => {
  it("points Profile settings at /profile for a student and /settings for everyone else (v1 PROFILE_HREF)", () => {
    expect(profileHrefFor("STUDENT")).toBe("/profile");
    for (const role of ["SUPER", "ADMIN", "LEADER", "MENTOR"] as const) {
      expect(profileHrefFor(role)).toBe("/settings");
    }
  });

  it.each(["SUPER", "ADMIN", "LEADER", "MENTOR", "STUDENT"] as const)(
    "%s: the avatar opens name, Profile settings and Sign out",
    (role) => {
      useSessionStore.setState(makeSession(role, {}, { name: "Mina Adel" }));
      renderWithProviders(<UserMenu />);

      expect(screen.getByText("MA")).toBeTruthy();
      fireEvent.press(screen.getByLabelText("User menu"));
      expect(screen.getByText("Mina Adel")).toBeTruthy();

      fireEvent.press(screen.getByText("Profile settings"));
      expect(mockPush).toHaveBeenCalledWith(role === "STUDENT" ? "/profile" : "/settings");
    },
  );

  it("signs out from the menu", () => {
    useSessionStore.setState(makeSession("MENTOR"));
    renderWithProviders(<UserMenu />);
    fireEvent.press(screen.getByLabelText("User menu"));
    fireEvent.press(screen.getByText("Sign out"));
    expect(mockLogout).toHaveBeenCalled();
  });

  it("renders nothing while signed out", () => {
    renderWithProviders(<UserMenu />);
    expect(screen.queryByLabelText("User menu")).toBeNull();
  });
});

describe("AppTopBar", () => {
  function TopInset() {
    return <Text>{`top=${useSafeAreaInsets().top}`}</Text>;
  }

  it("owns the top inset, so the screens below don't pad for the status bar twice", () => {
    useSessionStore.setState(makeSession("MENTOR"));
    renderWithProviders(
      <AppTopBar>
        <TopInset />
      </AppTopBar>,
    );
    expect(screen.getByLabelText("User menu")).toBeTruthy();
    expect(screen.getByText("top=0")).toBeTruthy();
  });
});
