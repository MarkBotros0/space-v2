import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { patch: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import ProfileDetailsScreen from "../../app/(app)/settings/profile";

const patch = apiClient.patch as jest.Mock;
const user = {
  id: 5,
  name: "Lee Leader",
  email: "lee@jpc.test",
  role: "LEADER" as const,
  avatarPath: null,
  hasPassword: true,
  phone: "0100",
  dateOfBirth: "1999-04-05",
  address: null,
};
const scopes = {
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.getState().setSession(user, scopes);
});

it("shows name, email, phone, date of birth and address for a non-student", () => {
  renderWithProviders(<ProfileDetailsScreen />);
  expect(screen.getByLabelText("Name").props.value).toBe("Lee Leader");
  expect(screen.getByLabelText("Email").props.value).toBe("lee@jpc.test");
  expect(screen.getByLabelText("Phone").props.value).toBe("0100");
  expect(screen.getByLabelText("Date of birth")).toHaveTextContent("Apr 5, 1999");
  expect(screen.getByLabelText("Address")).toBeTruthy();
});

it("sends only what changed and folds the server's row into the session", async () => {
  patch.mockResolvedValue({ data: { data: { user: { ...user, address: "12 Nile St, Cairo" } } } });
  renderWithProviders(<ProfileDetailsScreen />);
  fireEvent.changeText(screen.getByLabelText("Address"), "12 Nile St, Cairo");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith("/api/v1/me", { address: "12 Nile St, Cairo" }),
  );
  await waitFor(() => expect(useSessionStore.getState().user?.address).toBe("12 Nile St, Cairo"));
});

it("refuses a one-letter name before any request", () => {
  renderWithProviders(<ProfileDetailsScreen />);
  fireEvent.changeText(screen.getByLabelText("Name"), "L");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(patch).not.toHaveBeenCalled();
  expect(screen.getByText("At least 2 characters.")).toBeTruthy();
});
