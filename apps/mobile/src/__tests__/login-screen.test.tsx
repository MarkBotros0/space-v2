import { Alert } from "react-native";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import LoginScreen from "../../app/login";
import { renderWithProviders } from "./helpers/render";

// The screen now drives auth through useLogin (Task 6, ruling P9), which
// internally calls login() and then GET /api/v1/me before it resolves.
// use-session.test.tsx already covers that internal flow in isolation, so
// this suite mocks the hook itself and stays focused on the screen's own
// behavior: does it call the login function it's given, and does it react
// correctly to success/failure.
const mockLogin = jest.fn();
const mockGoogleLogin = jest.fn();
jest.mock("../hooks/use-session", () => ({
  useLogin: () => mockLogin,
  useGoogleLogin: () => mockGoogleLogin,
}));

const mockGoogle = { configured: false };
jest.mock("../lib/google-sign-in", () => {
  class GoogleSignInUnavailableError extends Error {}
  return {
    GoogleSignInUnavailableError,
    isGoogleSignInConfigured: () => mockGoogle.configured,
  };
});

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => mockSearchParams,
}));

/** An axios-shaped error, as authErrorMessage reads it; no status = no response. */
function axiosFailure(status?: number) {
  return Object.assign(new Error(status ? String(status) : "Network Error"), {
    isAxiosError: true,
    response: status ? { status, data: { error: { code: "invalid_credentials", message: "no" } } } : undefined,
  });
}

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockGoogle.configured = false;
  });

  it("navigates to /dashboard on a successful login", async () => {
    mockLogin.mockResolvedValue(undefined);

    renderWithProviders(<LoginScreen />);
    // `Input` exposes a label, not a placeholder — `getByPlaceholderText`
    // stopped matching once the screen was rebuilt on the `Input` primitive.
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByText("Sign in to JPC Space to continue.")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "hunter2");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
    expect(mockLogin).toHaveBeenCalledWith("sara@jpc.test", "hunter2");
  });

  it("shows an error message when login fails", async () => {
    mockLogin.mockRejectedValue(axiosFailure(401));

    renderWithProviders(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "wrong");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() => expect(screen.getByText("Invalid email or password.")).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();

    // The error renders inline above the form now, not as a full-screen
    // takeover — the fields must still be there, still holding what the
    // user typed, so a wrong password is a one-tap retry, not a re-fill.
    expect(screen.getByLabelText("Email").props.value).toBe("sara@jpc.test");
    expect(screen.getByLabelText("Password").props.value).toBe("wrong");
  });

  it("says it can't reach the server on a network error, not that the password is wrong", async () => {
    mockLogin.mockRejectedValue(axiosFailure());

    renderWithProviders(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "right-one");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() =>
      expect(screen.getByText("Can't reach JPC Space. Check your connection and try again.")).toBeTruthy(),
    );
    expect(screen.queryByText("Invalid email or password.")).toBeNull();
    expect(screen.getByLabelText("Email").props.value).toBe("sara@jpc.test");
    expect(screen.getByLabelText("Password").props.value).toBe("right-one");
  });

  it("links to the accept-invite screen", () => {
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByText("I have an invite code"));
    expect(mockPush).toHaveBeenCalledWith("/accept-invite");
  });

  it("returns to a check-in deep link after signing in (spec 04 R56)", async () => {
    mockSearchParams = { returnTo: "/checkin/AbC123XyZ0" };
    mockLogin.mockResolvedValue(undefined);

    renderWithProviders(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "hunter2");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/checkin/[token]", params: { token: "AbC123XyZ0" } }),
    );
  });

  it("ignores any other returnTo — no open redirect", async () => {
    mockSearchParams = { returnTo: "https://evil.example/phish" };
    mockLogin.mockResolvedValue(undefined);

    renderWithProviders(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "hunter2");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
  });
});

// Google sign-in (owner 2026-11-09), and the invite code made very clear (2026-11-07).
describe("LoginScreen — other ways in", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockGoogle.configured = false;
  });

  it("says Google is coming while this build has no Google client IDs", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByLabelText("Continue with Google"));
    expect(alert).toHaveBeenCalledWith("Coming soon", expect.stringContaining("Google"));
    expect(mockGoogleLogin).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("signs in with Google and opens Home", async () => {
    mockGoogle.configured = true;
    mockGoogleLogin.mockResolvedValue(true);
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByLabelText("Continue with Google"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
  });

  it("stays put, saying nothing, when Google's sheet is closed", async () => {
    mockGoogle.configured = true;
    mockGoogleLogin.mockResolvedValue(false);
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByLabelText("Continue with Google"));
    await waitFor(() => expect(mockGoogleLogin).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("points to the invite code, without saying they aren't invited, when Google finds no account", async () => {
    mockGoogle.configured = true;
    mockGoogleLogin.mockRejectedValue(
      Object.assign(new Error("403"), {
        isAxiosError: true,
        response: { status: 403, data: { error: { code: "no_account", message: "server words" } } },
      }),
    );
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByLabelText("Continue with Google"));

    const notice = await screen.findByText(
      "To sign in with Google, first set up your account with the invite code from your email.",
    );
    expect(notice.props.children).not.toMatch(/not invited|no account|isn't invited/i);
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole("link", { name: "Enter your invite code" }));
    expect(mockPush).toHaveBeenCalledWith("/accept-invite");
  });

  it("clears the invite pointer when they then sign in with a password", async () => {
    mockGoogle.configured = true;
    mockGoogleLogin.mockRejectedValue(
      Object.assign(new Error("403"), {
        isAxiosError: true,
        response: { status: 403, data: { error: { code: "no_account", message: "x" } } },
      }),
    );
    mockLogin.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByLabelText("Continue with Google"));
    await screen.findByText(/invite code from your email/);

    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "hunter2");
    fireEvent.press(screen.getByText("Sign in"));
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/first set up your account/)).toBeNull());
  });

  it("says Google sign-in didn't work when Google itself fails", async () => {
    mockGoogle.configured = true;
    mockGoogleLogin.mockRejectedValue(new Error("DEVELOPER_ERROR"));
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByLabelText("Continue with Google"));
    await waitFor(() => expect(screen.getByText(/Google sign-in didn't work/)).toBeTruthy());
  });

  it("gives the invite code a row of its own that says where the code comes from", () => {
    renderWithProviders(<LoginScreen />);
    const invite = screen.getByRole("button", { name: "I have an invite code" });
    expect(invite.props.accessibilityHint).toMatch(/invite email/);
    expect(screen.getByText(/Enter the code from your invite email/)).toBeTruthy();
  });
});
