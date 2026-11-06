import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../lib/token-storage", () => ({ saveSession: jest.fn() }));
jest.mock("../lib/push", () => ({ syncPushRegistration: jest.fn() }));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

import { DevUserSwitcher } from "../design/layout/dev-user-switcher";
import { apiClient } from "../lib/api-client";
import { saveSession } from "../lib/token-storage";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const scopes = {
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null,
};
const users = [
  { id: 1, email: "super@jpc.test", name: "Sue Super", role: "SUPER" },
  { id: 2, email: "lee@jpc.test", name: "Lee Leader", role: "LEADER" },
];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore
    .getState()
    .setSession(
      {
        id: 1,
        name: "Sue Super",
        email: "super@jpc.test",
        role: "SUPER",
        avatarPath: null,
        hasPassword: true,
      },
      scopes,
    );
});

it("renders nothing when the backend has the switcher off (404)", async () => {
  get.mockRejectedValue(
    Object.assign(new Error("404"), { isAxiosError: true, response: { status: 404 } }),
  );
  renderWithProviders(<DevUserSwitcher />);
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(screen.queryByLabelText("Switch user (dev)")).toBeNull();
});

it("lists users by role and signs in as the one picked", async () => {
  get.mockImplementation(async (url: string) =>
    url === "/api/v1/me"
      ? {
          data: {
            data: {
              user: {
                id: 2,
                name: "Lee Leader",
                email: "lee@jpc.test",
                role: "LEADER",
                avatarPath: null,
                hasPassword: true,
              },
              scopes,
            },
          },
        }
      : { data: { data: { users } } },
  );
  post.mockResolvedValue({
    data: {
      data: {
        accessToken: "a",
        expiresIn: 900,
        refreshToken: "r",
        user: { id: 2, name: "Lee Leader", email: "lee@jpc.test", role: "LEADER" },
      },
    },
  });
  renderWithProviders(<DevUserSwitcher />);
  fireEvent.press(await screen.findByLabelText("Switch user (dev)"));
  expect(await screen.findByText("LEADER")).toBeTruthy();
  fireEvent.press(await screen.findByText("Lee Leader"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
  expect(post).toHaveBeenCalledWith("/api/v1/dev/switch", { userId: 2 });
  expect(saveSession).toHaveBeenCalled();
  expect(useSessionStore.getState().user?.id).toBe(2);
});
