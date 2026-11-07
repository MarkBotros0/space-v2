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

it("shows at once that a switch is running, and locks the other rows until it lands", async () => {
  const more = [...users, { id: 3, email: "max@jpc.test", name: "Max Mentor", role: "MENTOR" }];
  get.mockResolvedValue({ data: { data: { users: more } } });
  let finish: (v: unknown) => void = () => {};
  post.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  renderWithProviders(<DevUserSwitcher />);
  fireEvent.press(await screen.findByLabelText("Switch user (dev)"));
  fireEvent.press(await screen.findByText("Lee Leader"));

  // Before the server answers: the row, the status line and the spinner say so.
  expect(screen.getByTestId("dev-switch-status")).toHaveTextContent("Signing in as Lee Leader…");
  expect(screen.getByText("Signing in…")).toBeTruthy();
  expect(screen.getByTestId("dev-switch-spinner")).toBeTruthy();
  // Another user cannot be picked meanwhile.
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByText("Max Mentor"));
  await new Promise((r) => setTimeout(r, 0));
  expect(post).toHaveBeenCalledTimes(1);

  // A failed switch gives the list back.
  finish(Promise.reject(new Error("down")));
  await waitFor(() =>
    expect(screen.getByTestId("dev-switch-status")).toHaveTextContent(/Signs in as the user you pick/),
  );
  expect(screen.queryByTestId("dev-switch-spinner")).toBeNull();
});
