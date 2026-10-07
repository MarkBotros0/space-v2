import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { post: jest.fn() } }));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import NewUserScreen from "../../app/(app)/users/new";

const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("/users/new (spec 11 §9)", () => {
  it("creates invite-first and opens the new account — no temp-password notice (R43 not ported)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { userId: 40 } } });
    renderWithProviders(<NewUserScreen />);

    expect(screen.queryByText(/ChangeMe/)).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Name"), "New Person");
    fireEvent.changeText(screen.getByLabelText("Email"), "p@jpc.test");
    fireEvent.press(screen.getByText("Create and send invite"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/users", {
        name: "New Person",
        email: "p@jpc.test",
        role: "STUDENT",
        graduationYear: null,
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/user/[id]", params: { id: "40" } }),
    );
  });

  it("requires a graduation year for alumni-only roles, using the shared schema's message (R2/R3)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<NewUserScreen />);

    fireEvent.changeText(screen.getByLabelText("Name"), "Leader Person");
    fireEvent.changeText(screen.getByLabelText("Email"), "l@jpc.test");
    fireEvent.press(screen.getByText("LEADER"));
    fireEvent.press(screen.getByText("Create and send invite"));

    await waitFor(() =>
      expect(screen.getByLabelText("Graduation year").props.accessibilityHint).toBe("Required for this role."),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("asks before creating a SUPER and sends confirmSuper only after the confirm (Decision 13)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { userId: 41 } } });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Create SUPER")?.onPress?.();
    });
    renderWithProviders(<NewUserScreen />);

    fireEvent.changeText(screen.getByLabelText("Name"), "Second Super");
    fireEvent.changeText(screen.getByLabelText("Email"), "s@jpc.test");
    fireEvent.press(screen.getByText("SUPER"));
    fireEvent.press(screen.getByText("Create and send invite"));

    expect(alert).toHaveBeenCalledWith("Create a SUPER account?", expect.any(String), expect.any(Array));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/users", expect.objectContaining({ role: "SUPER", confirmSuper: true })),
    );
    alert.mockRestore();
  });

  it("guards itself for a non-SUPER", () => {
    useSessionStore.setState(makeSession("ADMIN"));
    renderWithProviders(<NewUserScreen />);
    expect(screen.getByText("Only SUPER accounts can create users.")).toBeTruthy();
  });
});
