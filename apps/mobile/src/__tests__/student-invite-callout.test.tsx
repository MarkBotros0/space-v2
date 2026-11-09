import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import StudentDetailScreen from "../../app/(app)/student/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const detail = (invite: unknown) => ({
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  graduationYear: null,
  currentGroup: null,
  enrollments: [],
  invite,
  profile: {
    phone: null,
    university: null,
    faculty: null,
    universityGraduationYear: null,
    activeSeasonId: null,
    activeSeasonTitle: null,
    activeSeasonCode: null,
    dateOfBirth: null,
    notes: null,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("Resend invite on a student's page (owner, 2026-11-07)", () => {
  it("says the invite still works until when, and resends it", async () => {
    get.mockResolvedValue({
      data: { data: detail({ status: "invited", expiresAt: "2099-05-04T10:00:00.000Z" }) },
    });
    post.mockResolvedValue({
      data: {
        data: {
          issuedAt: "2099-05-01T10:00:00.000Z",
          expiresAt: "2099-05-08T10:00:00.000Z",
          usedAt: null,
          invitedByName: "Su",
        },
      },
    });
    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Hasn't set up their account yet")).toBeTruthy();
    expect(screen.getByText(/works until May 4, 2099/)).toBeTruthy();
    fireEvent.press(screen.getByText("Resend invite"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/students/21/invite"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Invite sent to sara@jpc.test."));
  });

  it("offers Send invite when no invite works any more", async () => {
    get.mockResolvedValue({ data: { data: detail({ status: "pending", expiresAt: null }) } });
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("Send invite")).toBeTruthy();
  });

  it("shows nothing once the account is set up", async () => {
    get.mockResolvedValue({ data: { data: detail(null) } });
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByLabelText("Edit profile")).toBeTruthy();
    expect(screen.queryByTestId("invite-callout")).toBeNull();
  });
});
