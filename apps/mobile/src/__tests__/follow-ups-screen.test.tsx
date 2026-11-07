import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import FollowUpsScreen from "../../app/(app)/(tabs)/follow-ups";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const fu = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id, studentUserId: 20 + id, studentName: name, reason: null,
  createdAt: "2026-10-01T10:00:00.000Z", dueAt: "2026-10-08T10:00:00.000Z", remindedAt: null, doneAt: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("MENTOR"));
});

describe("Follow-ups (owner, 2026-11-07)", () => {
  it("puts Due first, then Waiting, then Done recently", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          followUps: [
            fu(1, "Sara Student", { reason: "After the exam" }),
            fu(2, "Omar Odeh", { dueAt: "2999-01-08T10:00:00.000Z" }),
            fu(3, "Nadia Nour", { doneAt: "2026-10-09T10:00:00.000Z" }),
          ],
        },
      },
    });
    renderWithProviders(<FollowUpsScreen />);
    expect(await screen.findByText("DUE (1)")).toBeTruthy();
    expect(screen.getByText("WAITING (1)")).toBeTruthy();
    expect(screen.getByText("DONE RECENTLY")).toBeTruthy();
    expect(screen.getByText(/After the exam/)).toBeTruthy();
    expect(screen.getByText(/Due Jan 8, 2999/)).toBeTruthy();
    expect(screen.getByText("2 open")).toBeTruthy();
  });

  it("marks one done, and opens the student from its row", async () => {
    get.mockResolvedValue({ data: { data: { followUps: [fu(1, "Sara Student")] } } });
    post.mockResolvedValue({ data: { data: fu(1, "Sara Student", { doneAt: "2026-10-09T10:00:00.000Z" }) } });
    renderWithProviders(<FollowUpsScreen />);
    fireEvent.press(await screen.findByLabelText("Mark Sara Student done"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/follow-ups/1/done"));
    fireEvent.press(screen.getByText("Sara Student"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
  });

  it("says how to make one when there are none", async () => {
    get.mockResolvedValue({ data: { data: { followUps: [] } } });
    renderWithProviders(<FollowUpsScreen />);
    expect(await screen.findByText("No follow-ups")).toBeTruthy();
  });
});
