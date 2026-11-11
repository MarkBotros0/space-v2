import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
jest.mock("react-native-qrcode-svg", () => "QRCode");
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41", partId: "2" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));

import { StudentCheckInCard } from "../screens/check-in/student-check-in-card";
import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import {
  assignmentDetail,
  essayDetail,
  essayPart,
  essayWork,
  forumWork,
  videoWork,
  words,
} from "./helpers/assignment-fixtures";
import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";
import PartScreen from "../../app/(app)/assignment/[id]/part/[partId]";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const post = apiClient.post as jest.Mock;

// What axios rejects with on a device with no connection: no response at all.
const noNetwork = () => Object.assign(new Error("Network Error"), { isAxiosError: true, response: undefined });

const session = {
  id: 12,
  title: "Week 3",
  description: null,
  startsAt: "2099-03-15T18:00:00.000Z",
  dayKey: "2099-03-15",
  startTime: "20:00",
  durationMinutes: 90,
  location: null,
  youtubeUrl: null,
  recurrenceGroupId: null,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "S",
  checkInOpen: true,
  myAttendance: null,
  canMarkAttendance: false,
  canManageCheckIn: false,
};

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");

/** The checklist with every part done, and its essay (a draft, or returned). */
function serveAssignment(status: "DRAFT" | "RETURNED" = "DRAFT") {
  const works = [videoWork(1000), essayWork(status, 200, status === "RETURNED" ? "More." : null), forumWork(true)];
  get.mockImplementation((url: string) =>
    Promise.resolve({
      data: {
        data:
          url === "/api/v1/assignments/41"
            ? assignmentDetail(works)
            : essayDetail(status, words(200), { feedback: status === "RETURNED" ? "More." : null }),
      },
    }),
  );
}

/** The device has no connection: the queries already loaded stay, and writes reject. */
function goOffline() {
  act(() => onlineManager.setOnline(false));
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

afterEach(() => {
  act(() => onlineManager.setOnline(true));
});

describe("offline writes fail at once instead of hanging", () => {
  it("check-in tells the student to check their connection, and nothing goes out on reconnect", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: session } })
        : Promise.reject(new Error(`not served: ${url}`)),
    );
    post.mockRejectedValue(noNetwork());
    renderWithProviders(<StudentCheckInCard detail={session} />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/sessions/12"));
    goOffline();

    fireEvent.press(screen.getByText("Check In"));
    fireEvent.press(screen.getByText("Enter code instead"));
    fireEvent.changeText(screen.getByLabelText("Check-in code"), "AbC123XyZ0");
    fireEvent.press(screen.getByText("Check in"));

    expect(await screen.findByText(/Check your connection and try again/)).toBeTruthy();
    expect(screen.queryByText("Checking you in…")).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      "Can't check in. Couldn't check you in. Check your connection and try again.",
    );

    act(() => onlineManager.setOnline(true));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("Submit closes the confirm dialog with its error", async () => {
    serveAssignment();
    post.mockRejectedValue(noNetwork());
    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.press(await screen.findByRole("button", { name: "Submit" }));
    goOffline();
    fireEvent.press(await screen.findByText("Yes, submit"));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Submit this assignment?")).toBeNull());
    expect(screen.queryByText("Working…")).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Couldn't submit. Check your connection and try again.");
    expect(announce).toHaveBeenCalledWith("Couldn't submit. Check your connection and try again.");
    act(() => onlineManager.setOnline(true));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("Save draft fails at once and keeps the text", async () => {
    serveAssignment();
    put.mockRejectedValue(noNetwork());
    renderWithProviders(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText(essayPart.prompt), "my essay");
    goOffline();

    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't save. Check your connection and try again."),
    );
    expect(await screen.findByText("Save draft")).toBeTruthy();
    expect(screen.queryByText("Saving…")).toBeNull();
    expect(screen.getByDisplayValue("my essay")).toBeTruthy();
  });

  it("Hand in again fails at once into its own message", async () => {
    serveAssignment("RETURNED");
    post.mockRejectedValue(noNetwork());
    renderWithProviders(<PartScreen />);
    fireEvent.press(await screen.findByText("Hand in again"));
    goOffline();
    fireEvent.press(await screen.findByText("Yes, hand it in"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't hand it in. Check your connection and try again."),
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
});
