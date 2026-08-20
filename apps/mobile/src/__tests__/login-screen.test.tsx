import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import LoginScreen from "../../app/login";
import { login } from "../lib/api-client";

jest.mock("../lib/api-client", () => ({ login: jest.fn() }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("navigates home on a successful login", async () => {
    (login as jest.Mock).mockResolvedValue({
      accessToken: "a",
      expiresIn: 900,
      refreshToken: "r",
      user: { id: 1, name: "Sara", email: "sara@jpc.test", role: "STUDENT" },
    });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "hunter2");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/home"));
  });

  it("shows an error message when login fails", async () => {
    (login as jest.Mock).mockRejectedValue(new Error("nope"));

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "sara@jpc.test");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "wrong");
    fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() =>
      expect(screen.getByText("Incorrect email or password.")).toBeTruthy(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
