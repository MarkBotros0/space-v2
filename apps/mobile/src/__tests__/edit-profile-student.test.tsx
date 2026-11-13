import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), patch: jest.fn() } }));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

import type { MyProfile } from "@space/shared";

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import EditProfileScreen from "../../app/(app)/edit-profile";
import { expectQuietSuccess } from "./helpers/quiet-success";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const profile: MyProfile = {
  name: "Mina Adel",
  email: "mina@jpc.test",
  avatarPath: null,
  graduationYear: null,
  activeSeasonTitle: "GBV 2026",
  university: "Cairo University",
  faculty: null,
  universityGraduationYear: null,
  phone: null,
  dateOfBirth: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Mina Adel" }));
  get.mockResolvedValue({ data: { data: { profile } } });
});

it("edits the details and the academic record on one screen, Save pinned in the footer", async () => {
  renderWithProviders(<EditProfileScreen />);
  expect((await screen.findByLabelText("University")).props.value).toBe("Cairo University");
  expect(screen.getByLabelText("Name").props.value).toBe("Mina Adel");
  expect(screen.getByLabelText("Phone")).toBeTruthy();
  expect(screen.getByText("YOUR DETAILS")).toBeTruthy();
  expect(screen.getByText("ACADEMIC")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

it("saves only the academic part through PATCH /me/profile, the year as a number", async () => {
  patch.mockResolvedValue({ data: { data: { profile: { ...profile, universityGraduationYear: 2028 } } } });
  renderWithProviders(<EditProfileScreen />);
  fireEvent.changeText(await screen.findByLabelText("Graduation year"), "2028");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith("/api/v1/me/profile", {
      university: "Cairo University",
      faculty: null,
      universityGraduationYear: 2028,
    }),
  );
  expect(patch).toHaveBeenCalledTimes(1);
  await expectQuietSuccess();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it("saves both parts with one press when both changed", async () => {
  const user = useSessionStore.getState().user!;
  patch.mockImplementation((url: string) =>
    Promise.resolve(
      url === "/api/v1/me"
        ? { data: { data: { user: { ...user, address: "Cairo" } } } }
        : { data: { data: { profile: { ...profile, faculty: "Arts" } } } },
    ),
  );
  renderWithProviders(<EditProfileScreen />);
  fireEvent.changeText(await screen.findByLabelText("Faculty"), "Arts");
  fireEvent.changeText(screen.getByLabelText("Address"), "Cairo");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  expect(patch).toHaveBeenCalledWith("/api/v1/me", { address: "Cairo" });
  expect(patch).toHaveBeenCalledWith("/api/v1/me/profile", expect.objectContaining({ faculty: "Arts" }));
});

it("stays put and says so when the server's row is malformed (X10, R23)", async () => {
  patch.mockResolvedValue({ data: { data: { profile: { ...profile, notes: "internal" } } } });
  renderWithProviders(<EditProfileScreen />);
  fireEvent.changeText(await screen.findByLabelText("Faculty"), "Arts");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(mockBack).not.toHaveBeenCalled();
});
