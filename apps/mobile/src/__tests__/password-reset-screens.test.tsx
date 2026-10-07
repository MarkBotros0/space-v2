import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { post: jest.fn() } }));
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: { token?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockParams,
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";

import ForgotPasswordScreen from "../../app/forgot-password";
import ResetPasswordScreen from "../../app/reset-password";

const post = apiClient.post as jest.Mock;
const TOKEN = "ab".repeat(32);

/** An axios-shaped error, as apiErrorMessage reads it. */
function apiFailure(status: number, code: string, message: string) {
  return Object.assign(new Error(String(status)), {
    isAxiosError: true,
    response: { status, data: { error: { code, message } } },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe("ForgotPasswordScreen", () => {
  it("shows the same confirmation whatever the server knows (R67)", async () => {
    post.mockResolvedValue({ data: { data: { ok: true } } });
    renderWithProviders(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByLabelText("Email"), " someone@jpc.test ");
    fireEvent.press(screen.getByText("Send reset code"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/auth/forgot-password", { email: "someone@jpc.test" }),
    );
    expect(
      await screen.findByText(
        "If an account exists for that email, we've sent a reset code. It expires in 60 minutes.",
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("I have a reset code"));
    expect(mockPush).toHaveBeenCalledWith("/reset-password");
  });

  it("validates the address locally", async () => {
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "nope");
    fireEvent.press(screen.getByText("Send reset code"));
    await waitFor(() =>
      expect(screen.getByLabelText("Email").props.accessibilityHint).toBe("Must be a valid email."),
    );
    expect(post).not.toHaveBeenCalled();
  });
});

describe("ResetPasswordScreen", () => {
  it("takes the token from the deep link, then removes it from the route params (R80)", async () => {
    mockParams = { token: TOKEN };
    renderWithProviders(<ResetPasswordScreen />);

    await waitFor(() => expect(screen.getByLabelText("Reset code").props.value).toBe(TOKEN));
    expect(mockSetParams).toHaveBeenCalledTimes(1);
    expect(mockSetParams).toHaveBeenCalledWith({ token: undefined });
  });

  it("accepts a pasted v1 web link and resets (Decision 10)", async () => {
    post.mockResolvedValue({ data: { data: { ok: true } } });
    renderWithProviders(<ResetPasswordScreen />);

    fireEvent.changeText(
      screen.getByLabelText("Reset code"),
      `https://space.example.org/reset-password?token=${TOKEN}`,
    );
    fireEvent.changeText(screen.getByLabelText("New password"), "brand-new-password");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "brand-new-password");
    fireEvent.press(screen.getByText("Set new password"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/auth/reset-password", {
        token: TOKEN,
        password: "brand-new-password",
      }),
    );
    fireEvent.press(await screen.findByText("Go to sign in"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("enforces the shared password policy and the confirm match before posting", async () => {
    renderWithProviders(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByLabelText("Reset code"), TOKEN);
    fireEvent.changeText(screen.getByLabelText("New password"), "short");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "short");
    fireEvent.press(screen.getByText("Set new password"));

    await waitFor(() =>
      expect(screen.getByLabelText("New password").props.accessibilityHint).toBe("At least 8 characters."),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's one opaque refusal and offers a fresh request", async () => {
    post.mockRejectedValue(
      apiFailure(400, "invalid_reset_token", "This reset code is invalid or has expired. Request a new one."),
    );
    renderWithProviders(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByLabelText("Reset code"), TOKEN);
    fireEvent.changeText(screen.getByLabelText("New password"), "brand-new-password");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "brand-new-password");
    fireEvent.press(screen.getByText("Set new password"));

    expect(
      await screen.findByText("This reset code is invalid or has expired. Request a new one."),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("Request a new code"));
    expect(mockReplace).toHaveBeenCalledWith("/forgot-password");
  });
});
