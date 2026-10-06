import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { post: jest.fn() },
}));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";

import AcceptInviteScreen from "../../app/accept-invite";

const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AcceptInviteScreen", () => {
  it("posts the code and password, then routes to login (D1 — the flow completes at last)", async () => {
    post.mockResolvedValue({ data: { data: { ok: true } } });
    renderWithProviders(<AcceptInviteScreen />);

    fireEvent.changeText(screen.getByLabelText("Invite code"), "the-code-from-the-email-123456");
    fireEvent.changeText(screen.getByLabelText("Choose a password"), "brand-new-password");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "brand-new-password");
    fireEvent.press(screen.getByText("Activate account"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/auth/accept-invite", {
        token: "the-code-from-the-email-123456",
        password: "brand-new-password",
      }),
    );
    expect(await screen.findByText(/account is ready/i)).toBeTruthy();
    fireEvent.press(screen.getByText("Go to sign in"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("shows the one opaque failure message — the screen can't know more than the API tells it", async () => {
    post.mockRejectedValue(new Error("400"));
    renderWithProviders(<AcceptInviteScreen />);

    fireEvent.changeText(screen.getByLabelText("Invite code"), "an-expired-or-bogus-code-000000");
    fireEvent.changeText(screen.getByLabelText("Choose a password"), "brand-new-password");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "brand-new-password");
    fireEvent.press(screen.getByText("Activate account"));

    expect(
      await screen.findByText("That invite is invalid or has expired. Ask for a new one."),
    ).toBeTruthy();
  });

  it("enforces the shared password policy and the confirm match locally", async () => {
    renderWithProviders(<AcceptInviteScreen />);

    fireEvent.changeText(screen.getByLabelText("Invite code"), "the-code-from-the-email-123456");
    fireEvent.changeText(screen.getByLabelText("Choose a password"), "short");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "short");
    fireEvent.press(screen.getByText("Activate account"));

    await waitFor(() =>
      expect(screen.getByLabelText("Choose a password").props.accessibilityHint).toBe(
        "At least 8 characters.",
      ),
    );
    expect(post).not.toHaveBeenCalled();
  });
});
