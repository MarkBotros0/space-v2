import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
jest.mock("react-native-qrcode-svg", () => "QRCode");
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: mockPush }),
}));

import type { SessionDetail } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { mockCamera, resetMockCamera, scanMockBarcode } from "./helpers/expo-camera";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const detail: SessionDetail = {
  id: 12, title: "Week 3", description: null,
  startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15", startTime: "20:00", // required since Plan 6
  durationMinutes: 90, location: "Hall B",
  youtubeUrl: null, recurrenceGroupId: null, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring",
  checkInOpen: true, myAttendance: null, canMarkAttendance: false, canManageCheckIn: false,
};

const refusal = (status: number, code: string) =>
  Object.assign(new Error(String(status)), {
    isAxiosError: true,
    response: { status, data: { error: { code, message: code } } },
  });

function serve(d: typeof detail = detail) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/sessions/12"
      ? Promise.resolve({ data: { data: d } })
      : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMockCamera();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
});

describe("Student check-in on session detail (spec 04 §9 rows 3, 7)", () => {
  it("scans the console's QR (a bare token), posts it, and shows the result", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    expect(screen.getByTestId("mock-camera")).toBeTruthy();
    scanMockBarcode("AbC123XyZ0");

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/check-in", { token: "AbC123XyZ0" }));
    expect(await screen.findByText("You're checked in!")).toBeTruthy();
  });

  it("accepts v1's printed URL form and posts only the token (R41, Decision 8)", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "LATE", minutesLate: 12 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    scanMockBarcode("https://space.jpc.example/checkin/AbC123XyZ0");

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/check-in", { token: "AbC123XyZ0" }));
    expect(await screen.findByText("Checked in — late")).toBeTruthy();
    expect(screen.getByText("12 minutes after session start.")).toBeTruthy();
  });

  it("ignores a QR that is not a check-in code, and posts once however often the camera fires", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    scanMockBarcode("https://example.com/menu");
    expect(await screen.findByText("That doesn't look like a check-in code.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    // The camera reports the same frame repeatedly — one write, not three.
    scanMockBarcode("AbC123XyZ0");
    scanMockBarcode("AbC123XyZ0");
    scanMockBarcode("AbC123XyZ0");
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it("checks in by typed code, validating it with the same parser first", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Enter code"));
    fireEvent.changeText(screen.getByLabelText("Check-in code"), "abc");
    fireEvent.press(screen.getByText("Check in"));
    expect(screen.getByLabelText("Check-in code").props.accessibilityHint).toBe(
      "That doesn't look like a check-in code.",
    );
    expect(post).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Check-in code"), " AbC123XyZ0 ");
    fireEvent.press(screen.getByText("Check in"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/check-in", { token: "AbC123XyZ0" }));
  });

  it("explains a refusal by its code", async () => {
    serve();
    post.mockRejectedValue(refusal(409, "closed"));
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    scanMockBarcode("AbC123XyZ0");

    expect(await screen.findByText("Check-in is now closed.")).toBeTruthy();
    expect(screen.getByText("Can't check in")).toBeTruthy();
  });

  it("asks for camera permission when it has not been decided — no camera until granted", async () => {
    resetMockCamera({ granted: false, canAskAgain: true, status: "undetermined" });
    serve();
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    expect(screen.queryByTestId("mock-camera")).toBeNull();
    fireEvent.press(screen.getByText("Allow camera"));
    expect(mockCamera.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("sends a permanently denied camera to the OS settings, and keeps the code fallback", async () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    resetMockCamera({ granted: false, canAskAgain: false, status: "denied" });
    serve();
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    fireEvent.press(screen.getByText("Open settings"));
    expect(openSettings).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText("Cancel"));
    expect(screen.getByText("Enter code")).toBeTruthy();
  });

  it("offers nothing to scan while check-in is not open — the server's flag decides (C4, R73)", async () => {
    serve({ ...detail, checkInOpen: false });
    renderWithProviders(<SessionDetailScreen />);

    expect(await screen.findByText("Check-in isn't open right now.")).toBeTruthy();
    expect(screen.queryByText("Scan QR code")).toBeNull();
  });

  it("shows a student who already scanned in when they did, with no controls", async () => {
    serve({
      ...detail,
      myAttendance: { status: "PRESENT", notes: null, lateMinutes: null, checkedInAt: "2099-03-15T17:58:00.000Z" },
    });
    renderWithProviders(<SessionDetailScreen />);

    expect(await screen.findByText(/You checked in at/)).toBeTruthy();
    expect(screen.queryByText("Scan QR code")).toBeNull();
  });

  it("refreshes the session after a successful check-in", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });
    renderWithProviders(<SessionDetailScreen />);

    fireEvent.press(await screen.findByText("Scan QR code"));
    scanMockBarcode("AbC123XyZ0");

    await waitFor(() =>
      expect(get.mock.calls.filter(([url]) => url === "/api/v1/sessions/12").length).toBeGreaterThanOrEqual(2),
    );
  });

  it("is not shown to staff", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/sessions/12")
        return Promise.resolve({ data: { data: { ...detail, canMarkAttendance: true, canManageCheckIn: true } } });
      // Plan 6's staff cards: the console reads check-in state, the quiz card its quizzes.
      if (url === "/api/v1/sessions/12/check-in")
        return Promise.resolve({ data: { data: {
          state: "not_open", isOpen: false, checkInToken: null, checkInOpenAt: null,
          checkInClosedAt: null, expiresAt: null, expiresAtTime: null,
        } } });
      if (url === "/api/v1/sessions/12/quizzes") return Promise.resolve({ data: { data: { quizzes: [] } } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    renderWithProviders(<SessionDetailScreen />);

    expect(await screen.findByText("Week 3")).toBeTruthy();
    expect(screen.queryByText("Scan QR code")).toBeNull();
    expect(screen.queryByText("Your check-in")).toBeNull();
  });
});
