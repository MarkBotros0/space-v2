import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import StudentDetailScreen from "../../app/(app)/student/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const enrollment = (
  seasonId: number,
  title: string,
  status: "ACTIVE" | "WITHDRAWN" | "COMPLETED",
  seasonStatus: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED" = "ACTIVE",
) => ({
  enrollmentId: 500 + seasonId,
  seasonId,
  seasonCode: `S${seasonId}`,
  seasonTitle: title,
  seasonStatus,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  groupName: null,
  status,
  enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null,
  droppedAt: null,
  dropReason: null,
  attendancePct: null,
});

const detail = (enrollments: ReturnType<typeof enrollment>[]) => ({
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  graduationYear: null,
  currentGroup: null,
  enrollments,
  profile: {
    university: null,
    faculty: null,
    universityGraduationYear: null,
    activeSeasonId: 7,
    activeSeasonTitle: "Spring 2099",
    activeSeasonCode: "S7",
    phone: null,
    dateOfBirth: null,
    notes: null,
  },
});

const refusal = (code: string, message: string) =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message } } },
  });

async function openSeasons() {
  fireEvent.press(await screen.findByText("Seasons"));
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockResolvedValue({
    data: {
      data: detail([
        enrollment(7, "Spring 2099", "WITHDRAWN"),
        enrollment(8, "Autumn 2098", "WITHDRAWN", "COMPLETED"),
        enrollment(9, "Summer 2099", "ACTIVE"),
      ]),
    },
  });
});

describe("Bring back", () => {
  it("shows to a super on a dropped row of an unfinished season only", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);
    await openSeasons();
    expect(screen.getAllByText("Bring back")).toHaveLength(1);
  });

  it("is absent for an admin", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<StudentDetailScreen />);
    await openSeasons();
    expect(screen.queryByText("Bring back")).toBeNull();
  });

  it("confirms, restores, and refreshes the student", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { ok: true } } });
    renderWithProviders(<StudentDetailScreen />);
    await openSeasons();
    fireEvent.press(screen.getByText("Bring back"));

    expect(screen.getByText("Bring Sara Student back into Spring 2099?")).toBeTruthy();
    const reads = get.mock.calls.length;
    fireEvent.press(screen.getAllByText("Bring back")[1]!);

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/students/21/enrollments/7/restore", {}));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(reads));
    expect(toast.success).toHaveBeenCalled();
  });

  it("offers Add anyway with the server's reason on not_eligible, and re-posts with the override", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post
      .mockRejectedValueOnce(refusal("not_eligible", "Sara hasn't passed GBV, which Spring 2099 needs"))
      .mockResolvedValueOnce({ data: { data: { ok: true } } });
    renderWithProviders(<StudentDetailScreen />);
    await openSeasons();
    fireEvent.press(screen.getByText("Bring back"));
    fireEvent.press(screen.getAllByText("Bring back")[1]!);

    expect(await screen.findByText("Sara hasn't passed GBV, which Spring 2099 needs")).toBeTruthy();
    fireEvent.press(screen.getByText("Add anyway"));

    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith("/api/v1/students/21/enrollments/7/restore", { override: true }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says any other refusal in a toast", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockRejectedValueOnce(refusal("person_unavailable", "Sara is already in a season at the same time"));
    renderWithProviders(<StudentDetailScreen />);
    await openSeasons();
    fireEvent.press(screen.getByText("Bring back"));
    fireEvent.press(screen.getAllByText("Bring back")[1]!);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Sara is already in a season at the same time"));
    expect(screen.queryByText("Add anyway")).toBeNull();
  });

  it("Cancel in the not-eligible state clears it, so the next row starts fresh", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockResolvedValue({
      data: {
        data: detail([enrollment(7, "Spring 2099", "WITHDRAWN"), enrollment(10, "Winter 2099", "WITHDRAWN", "DRAFT")]),
      },
    });
    post.mockRejectedValueOnce(refusal("not_eligible", "Sara hasn't passed GBV"));
    renderWithProviders(<StudentDetailScreen />);
    await openSeasons();
    fireEvent.press(screen.getAllByText("Bring back")[0]!);
    fireEvent.press(screen.getAllByText("Bring back")[2]!);
    expect(await screen.findByText("Add anyway")).toBeTruthy();

    fireEvent.press(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByText("Add anyway")).toBeNull());

    fireEvent.press(screen.getAllByText("Bring back")[1]!);
    expect(screen.getByText("Bring Sara Student back into Winter 2099?")).toBeTruthy();
    expect(screen.queryByText("Add anyway")).toBeNull();
  });
});
