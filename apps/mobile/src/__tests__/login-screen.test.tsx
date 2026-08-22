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
jest.mock("../hooks/use-session", () => ({ useLogin: () => mockLogin }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("navigates to /dashboard on a successful login", async () => {
    mockLogin.mockResolvedValue(undefined);

    renderWithProviders(<LoginScreen />);
    // `Input` exposes a label, not a placeholder — `getByPlaceholderText`
    // stopped matching once the screen was rebuilt on the `Input` primitive.
    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "hunter2");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
    expect(mockLogin).toHaveBeenCalledWith("sara@jpc.test", "hunter2");
  });

  it("shows an error message when login fails", async () => {
    mockLogin.mockRejectedValue(new Error("nope"));

    renderWithProviders(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "wrong");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() =>
      expect(screen.getByText("Incorrect email or password.")).toBeTruthy(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
