import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import StudentDetailScreen from "../../app/(app)/student/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const enrollment = (seasonId: number, title: string, status: "ACTIVE" | "WITHDRAWN" = "ACTIVE") => ({
  enrollmentId: 500 + seasonId,
  seasonId,
  seasonCode: `S${seasonId}`,
  seasonTitle: title,
  seasonStatus: "ACTIVE" as const,
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

const base = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  graduationYear: null,
  currentGroup: null,
  enrollments: [enrollment(7, "Spring 2099"), enrollment(8, "Autumn 2099")],
};
const publicProfile = {
  university: null, year: null, gifts: null,
  activeSeasonId: 7, activeSeasonTitle: "Spring 2099", activeSeasonCode: "S7",
};
const internalDetail = {
  ...base,
  profile: {
    ...publicProfile,
    phone: null,
    // v1's browser-local midnight for 9 March (Cairo, UTC+2) — Decision 8.
    dateOfBirth: "2004-03-08T22:00:00.000Z",
    spiritualBackground: null,
    notes: null,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockResolvedValue({ data: { data: internalDetail } });
});

describe("StudentDetailScreen — lifecycle actions (Plan 10)", () => {
  it("gives SUPER Edit, Graduate, Delete and a Drop per ACTIVE row; the birthday lands on its own day", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("Graduate")).toBeTruthy();
    expect(screen.getByText("Delete student")).toBeTruthy();
    expect(screen.getAllByText("Drop")).toHaveLength(2);
    expect(screen.getByText(/Mar 9, 2004/)).toBeTruthy();
  });

  it("gives an ADMIN of season 7 Edit and ONE Drop — no Graduate, no Delete", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<StudentDetailScreen />);

    await screen.findByText("Sara Student");
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.queryByText("Graduate")).toBeNull();
    expect(screen.queryByText("Delete student")).toBeNull();
    expect(screen.getAllByText("Drop")).toHaveLength(1);
  });

  it("gives a MENTOR no actions at all", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    get.mockResolvedValue({ data: { data: { ...base, profile: publicProfile } } });
    renderWithProviders(<StudentDetailScreen />);

    await screen.findByText("Sara Student");
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Drop")).toBeNull();
  });

  it("Edit goes to the edit route", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Edit"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]/edit", params: { id: "21" } });
  });

  it("graduates through the sheet with the current year as the default (R59)", async () => {
    const year = new Date().getFullYear();
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { id: 21, graduationYear: year, enrollmentsCompleted: 2 } } });
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Graduate"));
    expect(screen.getByText("Graduate Sara Student?")).toBeTruthy();
    expect(screen.getByLabelText("JPCS graduation year").props.value).toBe(String(year));
    fireEvent.press(screen.getByText("Graduate student"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/students/21/graduate", { graduationYear: year }),
    );
    await waitFor(() => expect(screen.queryByText("Graduate Sara Student?")).toBeNull());
  });

  it("refuses an out-of-range year in the sheet without calling the API (R58's bound, one schema)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Graduate"));
    fireEvent.changeText(screen.getByLabelText("JPCS graduation year"), "1989");
    fireEvent.press(screen.getByText("Graduate student"));

    await waitFor(() =>
      expect(screen.getByLabelText("JPCS graduation year").props.accessibilityHint).toBe(
        `Enter a year between 1990 and ${new Date().getFullYear()}.`,
      ),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("drops one season's enrollment with a reason through the sheet", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    patch.mockResolvedValue({ data: { data: { id: 507, status: "WITHDRAWN" } } });
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press((await screen.findAllByText("Drop"))[0]!);
    expect(screen.getByText("Drop from Spring 2099?")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "Moved away");
    fireEvent.press(screen.getByText("Drop student"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/students/21/enrollments/7", {
        status: "WITHDRAWN",
        dropReason: "Moved away",
      }),
    );
  });

  it("deletes after a destructive confirm and leaves for the list", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    del.mockResolvedValue({ data: { data: { id: 21, deletedAt: "2099-01-01T00:00:00.000Z" } } });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Delete student"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/students/21"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/students"));
    alert.mockRestore();
  });
});
