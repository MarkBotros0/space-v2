import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { delete: jest.fn() } }));
jest.mock("../lib/token-storage", () => ({ clearSession: jest.fn() }));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

import { useDeleteAccountFlow } from "../components/DeleteAccount";
import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { clearSession } from "../lib/token-storage";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

const del = apiClient.delete as jest.Mock;

function Harness() {
  const flow = useDeleteAccountFlow();
  return (
    <>
      <Pressable accessibilityRole="button" onPress={flow.request}>
        <Text>Delete account</Text>
      </Pressable>
      {flow.dialog}
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.getState().setSession(
    {
      id: 5,
      name: "P",
      email: "p@jpc.test",
      role: "STUDENT",
      avatarPath: null,
      hasPassword: true,
    },
    { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
  );
});

describe("Delete account", () => {
  it("asks first, then deletes, clears the session and lands on login", async () => {
    del.mockResolvedValue({ data: { data: { deletedAt: "2026-11-06T10:00:00.000Z" } } });
    renderWithProviders(<Harness />);
    fireEvent.press(screen.getByText("Delete account"));
    expect(del).not.toHaveBeenCalled();
    expect(await screen.findByText("Delete your account?")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Delete account" });
    fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
    expect(del).toHaveBeenCalledWith("/api/v1/me");
    expect(clearSession).toHaveBeenCalled();
    expect(useSessionStore.getState().user).toBeNull();
  });

  it("keeps the last SUPER signed in and says why", async () => {
    del.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "last_super", message: "Only SUPER." } } },
      }),
    );
    renderWithProviders(<Harness />);
    fireEvent.press(screen.getByText("Delete account"));
    const buttons = await screen.findAllByRole("button", { name: "Delete account" });
    fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(useSessionStore.getState().user).not.toBeNull();
  });
});
