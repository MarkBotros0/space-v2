import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { format } from "date-fns";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import NewSessionScreen from "../../app/(app)/session/new";
import EditSessionScreen from "../../app/(app)/session/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const detail = (over: Record<string, unknown> = {}) => ({
  id: 12,
  title: "Week 3",
  description: null,
  startsAt: "2099-03-15T18:00:00.000Z",
  dayKey: "2099-03-15",
  startTime: "20:00",
  durationMinutes: 90,
  location: "Hall B",
  youtubeUrl: null,
  recurrenceGroupId: "rg1",
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring",
  checkInOpen: false,
  myAttendance: null,
  canMarkAttendance: true,
  canManageCheckIn: true,
  ...over,
});
const seriesItem = (id: number, dayKey: string, attendanceCount: number, isAnchor = false) => ({
  id,
  title: "Week 3",
  startsAt: `${dayKey}T18:00:00.000Z`,
  dayKey,
  startTime: "20:00",
  isAnchor,
  attendanceCount,
});
const conflict = (code: string, message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message } } },
  });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
});

/** Pick a day in the open month grid; today is always on screen when no value is set. */
function pickToday() {
  fireEvent.press(screen.getByLabelText("Date"));
  fireEvent.press(screen.getByLabelText(format(new Date(), "PPP")));
  return format(new Date(), "yyyy-MM-dd");
}

describe("NewSessionScreen (/session/new?seasonId=)", () => {
  beforeEach(() => {
    mockParams = { seasonId: "7" };
    get.mockResolvedValue({
      data: {
        data: {
          id: 7,
          code: "s7",
          title: "Spring 2099",
          program: "TEST",
          year: 2099,
          status: "ACTIVE",
          startDate: "2099-01-01T00:00:00.000Z",
          endDate: "2099-12-31T00:00:00.000Z",
          description: null,
          sessionCount: 0,
          studentCount: 0,
          absenceBudgetMinutes: 0,
          absenceWeightMinutes: 0,
          canAdminister: true,
          groups: [],
        },
      },
    });
  });

  it("names the season and sends org wall-clock fields — never a device-composed instant (X13, D-16.6)", async () => {
    post.mockResolvedValue({ data: { data: { id: 55, recurrenceGroupId: "rgX" } } });
    renderWithProviders(<NewSessionScreen />);

    expect(await screen.findByText("Add a session to Spring 2099.")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Title"), "Kickoff");
    const day = pickToday();
    // 18:00 default -> 19:00 -> :30
    fireEvent.press(screen.getByLabelText("Hour"));
    fireEvent.press(screen.getByText("19"));
    fireEvent.press(screen.getByLabelText("Minute"));
    fireEvent.press(screen.getByText("30"));
    fireEvent.changeText(screen.getByLabelText("Repeat weekly for (weeks)"), "3");
    fireEvent.press(screen.getByText("Create session"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/sessions", {
        seasonId: 7,
        title: "Kickoff",
        startDay: day,
        startTime: "19:30",
        durationMinutes: 90,
        location: null,
        youtubeUrl: null,
        description: null,
        repeatWeeks: 3,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "55" } });
  });

  it("validates with the server's schema before sending", async () => {
    renderWithProviders(<NewSessionScreen />);
    pickToday();
    fireEvent.press(screen.getByText("Create session"));
    expect(screen.getByLabelText("Title").props.accessibilityHint).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("defaults the start to 18:00 and picks minutes on a 15-minute grid (REG-73)", () => {
    renderWithProviders(<NewSessionScreen />);
    expect(screen.getByText("18")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Minute"));
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.queryByText("20")).toBeNull();
    expect(screen.queryByText("05")).toBeNull();
  });

  it("shows location for in-person and the YouTube link for online, sending only the chosen one (REG-73)", async () => {
    post.mockResolvedValue({ data: { data: { id: 56, recurrenceGroupId: null } } });
    renderWithProviders(<NewSessionScreen />);
    expect(screen.getByLabelText("Location")).toBeTruthy();
    expect(screen.queryByLabelText("YouTube link")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Location"), "Hall A");
    fireEvent.press(screen.getByLabelText("Online"));
    expect(screen.queryByLabelText("Location")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("YouTube link"), "https://youtube.com/watch?v=abc");
    fireEvent.changeText(screen.getByLabelText("Title"), "Remote");
    pickToday();
    fireEvent.press(screen.getByText("Create session"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/sessions",
        expect.objectContaining({
          location: null,
          youtubeUrl: "https://youtube.com/watch?v=abc",
          startTime: "18:00",
        }),
      ),
    );
  });

  it("cancels back", () => {
    renderWithProviders(<NewSessionScreen />);
    fireEvent.press(screen.getByText("Cancel"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("explains a missing season instead of rendering a dead form", () => {
    mockParams = {};
    renderWithProviders(<NewSessionScreen />);
    expect(screen.getByText("Open a season first, then add a session to it.")).toBeTruthy();
  });
});

describe("EditSessionScreen (/session/[id]/edit)", () => {
  beforeEach(() => {
    mockParams = { id: "12" };
  });

  function routeGets(d: ReturnType<typeof detail>) {
    get.mockImplementation((url: string, config?: { params?: { scope?: string } }) => {
      if (url === "/api/v1/sessions/12") return Promise.resolve({ data: { data: d } });
      if (url === "/api/v1/sessions/12/series") {
        const scope = config?.params?.scope;
        const sessions =
          scope === "future"
            ? [seriesItem(12, "2099-03-15", 1, true), seriesItem(13, "2099-03-22", 0)]
            : [
                seriesItem(11, "2099-03-08", 0),
                seriesItem(12, "2099-03-15", 1, true),
                seriesItem(13, "2099-03-22", 0),
              ];
        return Promise.resolve({
          data: { data: { scope, sessions, attendanceCount: 1, videoProgressCount: 0 } },
        });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  }

  it("pre-fills from the server's org day/time, previews the scope, and saves with it", async () => {
    routeGets(detail());
    patch.mockResolvedValue({ data: { data: { updated: 2 } } });
    renderWithProviders(<EditSessionScreen />);

    expect(await screen.findByLabelText("Date")).toHaveTextContent("March 15th, 2099");
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByLabelText("Location")).toBeTruthy(); // no YouTube link -> in-person

    fireEvent.press(screen.getByLabelText("Apply to"));
    fireEvent.press(screen.getByText("This and future sessions"));
    expect(
      await screen.findByText("This affects 2 sessions, 1 with attendance recorded."),
    ).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/series", { params: { scope: "future" } });

    fireEvent.press(screen.getByLabelText("Hour"));
    fireEvent.press(screen.getByText("19"));
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/sessions/12", {
        title: "Week 3",
        startDay: "2099-03-15",
        startTime: "19:00",
        durationMinutes: 90,
        location: "Hall B",
        youtubeUrl: null,
        description: null,
        scope: "future",
      }),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it("hides the scope selector for a one-off session (spec 03 R29)", async () => {
    routeGets(detail({ recurrenceGroupId: null }));
    renderWithProviders(<EditSessionScreen />);
    await screen.findByLabelText("Title");
    expect(screen.queryByLabelText("Apply to")).toBeNull();
  });

  it("deletes on a second press; a has_student_records 409 offers the forced delete", async () => {
    routeGets(detail({ recurrenceGroupId: null }));
    del
      .mockRejectedValueOnce(
        conflict(
          "has_student_records",
          "Attendance or video progress has been recorded; pass force to delete it too.",
        ),
      )
      .mockResolvedValueOnce({ data: { data: { deleted: 1 } } });
    renderWithProviders(<EditSessionScreen />);

    fireEvent.press(await screen.findByText("Delete session"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() =>
      expect(del).toHaveBeenCalledWith("/api/v1/sessions/12", {
        data: { scope: "one", force: false },
      }),
    );

    fireEvent.press(await screen.findByText("Delete including attendance"));
    fireEvent.press(screen.getByText("Really delete, including attendance?"));
    await waitFor(() =>
      expect(del).toHaveBeenLastCalledWith("/api/v1/sessions/12", {
        data: { scope: "one", force: true },
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/seasons/[code]",
      params: { code: "s7" },
    });
  });

  it("refuses a caller who cannot manage the session", async () => {
    routeGets(detail({ canManageCheckIn: false }));
    renderWithProviders(<EditSessionScreen />);
    expect(
      await screen.findByText("Only this season's admins can edit its sessions."),
    ).toBeTruthy();
  });
});
