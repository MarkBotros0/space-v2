import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "s7" }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { detail, routeGets } from "./helpers/season-detail-fixtures";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import InviteToSeasonScreen from "../../app/(app)/seasons/[code]/invite";

const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN"));
});

describe("/seasons/[code]/invite (owner, 2026-11-07: season admins invite people)", () => {
  it("adds someone new into this season, with no season picker, then opens them", async () => {
    routeGets(detail({ status: "ACTIVE" }));
    post.mockResolvedValue({ data: { data: { id: 77, email: "new@jpc.test", inviteSent: true } } });
    renderWithProviders(<InviteToSeasonScreen />);

    fireEvent.changeText(await screen.findByLabelText("Full name"), "New Person");
    fireEvent.changeText(screen.getByLabelText("Email"), "new@jpc.test");
    expect(screen.queryByLabelText(/Enroll in season/)).toBeNull();
    fireEvent.press(screen.getByText("Add and send invite"));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]).toEqual([
      "/api/v1/students",
      expect.objectContaining({ name: "New Person", email: "new@jpc.test", seasonId: 7 }),
    ]);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "77" } }));
    expect(toast.success).toHaveBeenCalledWith("Added to TEST 2099. Their invite is on its way.");
  });

  it("offers no form on a finished season", async () => {
    routeGets(detail({ status: "COMPLETED" }));
    renderWithProviders(<InviteToSeasonScreen />);
    expect(await screen.findByText("This season has finished")).toBeTruthy();
    expect(screen.queryByLabelText("Full name")).toBeNull();
  });

  it("offers no form to someone who doesn't run the season", async () => {
    routeGets(detail({ status: "ACTIVE", canAdminister: false }));
    renderWithProviders(<InviteToSeasonScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(screen.queryByLabelText("Full name")).toBeNull();
  });
});
