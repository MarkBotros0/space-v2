import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, dismissTo: mockDismissTo, back: jest.fn() }),
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
  phone: null,
  university: null, faculty: null, universityGraduationYear: null,
  activeSeasonId: 7, activeSeasonTitle: "Spring 2099", activeSeasonCode: "S7",
};
const internalDetail = {
  ...base,
  profile: {
    ...publicProfile,
    phone: null,
    // v1's browser-local midnight for 9 March (Cairo, UTC+2) — Decision 8.
    dateOfBirth: "2004-03-08T22:00:00.000Z",
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

    expect(await screen.findByLabelText("Edit profile")).toBeTruthy();
    expect(screen.getByText("Graduate")).toBeTruthy();
    expect(screen.getByText("Delete student")).toBeTruthy();
    expect(screen.getByText(/Mar 9, 2004/)).toBeTruthy();
    fireEvent.press(screen.getByText("Seasons"));
    expect(screen.getAllByText("Drop")).toHaveLength(2);
  });

  it("keeps Delete student out of the primary action group, in its own block at the bottom (sweep F8)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);

    // Owner 2026-11-07: Edit sits beside the name; Graduate is the one action under it.
    await screen.findByLabelText("Edit profile");
    const primary = screen.getByTestId("student-actions");
    expect(within(primary).getByText("Graduate")).toBeTruthy();
    expect(within(primary).queryByText("Delete student")).toBeNull();
    expect(within(screen.getByTestId("student-danger-zone")).getByText("Delete student")).toBeTruthy();
  });

  it("gives an ADMIN of season 7 Edit and ONE Drop — no Graduate, no Delete", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<StudentDetailScreen />);

    await screen.findByLabelText("Edit profile");
    expect(screen.queryByText("Graduate")).toBeNull();
    expect(screen.queryByText("Delete student")).toBeNull();
    fireEvent.press(screen.getByText("Seasons"));
    expect(screen.getAllByText("Drop")).toHaveLength(1);
  });

  it("gives a MENTOR no actions at all", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    get.mockResolvedValue({ data: { data: { ...base, profile: publicProfile } } });
    renderWithProviders(<StudentDetailScreen />);

    await screen.findByRole("tab", { name: "Notes" });
    expect(screen.queryByLabelText("Edit profile")).toBeNull();
    // No Seasons tab, so nothing to drop from (owner, 2026-11-07).
    expect(screen.queryByRole("tab", { name: "Seasons" })).toBeNull();
    expect(screen.queryByText("Drop")).toBeNull();
  });

  it("shows SUPER who graduated someone by exception, when and why; no row without it", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockResolvedValue({
      data: {
        data: {
          ...internalDetail,
          graduationYear: 2026,
          graduatedByException: { at: "2026-11-07T10:00:00.000Z", byName: "Sam Super", reason: "Finished abroad" },
        },
      },
    });
    const { unmount } = renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("Graduated by exception")).toBeTruthy();
    expect(screen.getByText(/Sam Super on .* Finished abroad/)).toBeTruthy();
    expect(screen.getByText("Alumnus · School of 2026")).toBeTruthy();
    unmount();

    get.mockResolvedValue({ data: { data: { ...internalDetail, graduatedByException: null } } });
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByTestId("student-details");
    expect(screen.queryByText("Graduated by exception")).toBeNull();
  });

  it("Edit goes to the edit route", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Edit profile"));
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
    // Asked to close: gone, or on its way out and no longer taking touches (jest never ends the slide).
    await waitFor(() => {
      const backdrop = screen.queryByTestId("sheet-backdrop");
      if (backdrop) expect(backdrop.parent?.props.pointerEvents).toBe("none");
    });
  });

  describe("someone who hasn't passed a graduating season", () => {
    const notQualified = {
      isAxiosError: true,
      response: { status: 409, data: { error: { code: "not_qualified", message: "Sara Student hasn't passed a graduating season." } } },
    };

    const TICK = "I understand this can't be undone";
    const REASON = "He finished the program abroad";
    const openWarning = async () => {
      fireEvent.press(await screen.findByText("Graduate"));
      fireEvent.press(screen.getByText("Graduate student"));
      await screen.findByText("Graduate Sara Student anyway?");
    };

    it("switches the same sheet to a warning with the consequences", async () => {
      useSessionStore.setState(makeSession("SUPER"));
      post.mockRejectedValueOnce(notQualified);
      renderWithProviders(<StudentDetailScreen />);
      await openWarning();

      expect(screen.getByText("Sara Student hasn't passed a graduating season. Students become alumni by passing one. Only use this in a very rare case.")).toBeTruthy();
      expect(screen.getByText("They become an alumnus permanently. This can't be undone in the app.")).toBeTruthy();
      expect(screen.getByText(`They'll be listed as School of ${new Date().getFullYear()}.`)).toBeTruthy();
      expect(screen.getByText("They can be appointed leader or admin, and can no longer join regular seasons as a student.")).toBeTruthy();
      expect(screen.getByText("Any regular season they're in now ends for them, with no result. A community-wide season carries on.")).toBeTruthy();
      expect(screen.getByText("Your name and your reason are recorded.")).toBeTruthy();
      expect(screen.queryByLabelText("JPCS graduation year")).toBeNull();
      expect(screen.getAllByTestId("sheet")).toHaveLength(1);
      expect(post).toHaveBeenCalledTimes(1);
    });

    it("keeps the action locked until there is a reason of 10 characters and the tick", async () => {
      useSessionStore.setState(makeSession("SUPER"));
      post.mockRejectedValueOnce(notQualified);
      renderWithProviders(<StudentDetailScreen />);
      await openWarning();

      const locked = () => screen.getByRole("button", { name: "Graduate anyway" }).props.accessibilityState?.disabled;
      expect(locked()).toBe(true);
      const tick = screen.getByLabelText(TICK);
      expect(tick.props.accessibilityRole).toBe("checkbox");
      expect(tick.props.accessibilityState.checked).toBe(false);

      fireEvent.press(tick);
      expect(screen.getByLabelText(TICK).props.accessibilityState.checked).toBe(true);
      expect(locked()).toBe(true); // ticked, no reason

      fireEvent.changeText(screen.getByLabelText("Reason"), "too short");
      expect(locked()).toBe(true);
      expect(screen.getByLabelText("Reason").props.accessibilityHint).toMatch(/at least 10/i);

      fireEvent.changeText(screen.getByLabelText("Reason"), REASON);
      expect(locked()).toBe(false);
      expect(screen.getByLabelText("Reason").props.accessibilityHint).toBeFalsy();

      fireEvent.press(screen.getByLabelText(TICK)); // un-tick locks it again
      expect(locked()).toBe(true);
      expect(post).toHaveBeenCalledTimes(1);
    });

    it("shows no reason error before they type anything", async () => {
      useSessionStore.setState(makeSession("SUPER"));
      post.mockRejectedValueOnce(notQualified);
      renderWithProviders(<StudentDetailScreen />);
      await openWarning();
      expect(screen.getByLabelText("Reason").props.accessibilityHint).toBeFalsy();
    });

    it("posts override with the trimmed reason once both are valid", async () => {
      const year = new Date().getFullYear();
      useSessionStore.setState(makeSession("SUPER"));
      post.mockRejectedValueOnce(notQualified);
      post.mockResolvedValueOnce({ data: { data: { id: 21, graduationYear: year, enrollmentsCompleted: 0 } } });
      renderWithProviders(<StudentDetailScreen />);
      await openWarning();

      fireEvent.changeText(screen.getByLabelText("Reason"), `  ${REASON}  `);
      fireEvent.press(screen.getByLabelText(TICK));
      fireEvent.press(screen.getByText("Graduate anyway"));
      await waitFor(() =>
        expect(post).toHaveBeenLastCalledWith("/api/v1/students/21/graduate", {
          graduationYear: year,
          override: true,
          overrideReason: REASON,
        }),
      );
    });

    it("Cancel posts nothing more, and reopening starts over from step one", async () => {
      useSessionStore.setState(makeSession("SUPER"));
      post.mockRejectedValueOnce(notQualified);
      renderWithProviders(<StudentDetailScreen />);
      await openWarning();
      fireEvent.changeText(screen.getByLabelText("Reason"), REASON);
      fireEvent.press(screen.getByLabelText(TICK));

      fireEvent.press(screen.getByText("Cancel"));
      expect(post).toHaveBeenCalledTimes(1);

      post.mockRejectedValueOnce(notQualified);
      fireEvent.press(await screen.findByText("Graduate"));
      expect(screen.getByText("Graduate Sara Student?")).toBeTruthy();
      fireEvent.press(screen.getByText("Graduate student"));
      await screen.findByText("Graduate Sara Student anyway?");
      expect(screen.getByLabelText("Reason").props.value).toBe("");
      expect(screen.getByLabelText(TICK).props.accessibilityState.checked).toBe(false);
      expect(screen.getByRole("button", { name: "Graduate anyway" }).props.accessibilityState?.disabled).toBe(true);
    });

    it("any other refusal stays on the first step, in the server's words", async () => {
      useSessionStore.setState(makeSession("SUPER"));
      post.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "already_graduated", message: "This student has already graduated." } } },
      });
      renderWithProviders(<StudentDetailScreen />);
      fireEvent.press(await screen.findByText("Graduate"));
      fireEvent.press(screen.getByText("Graduate student"));
      expect(await screen.findByText("This student has already graduated.")).toBeTruthy();
      expect(screen.queryByText("Graduate anyway")).toBeNull();
    });
  });

  it("clears the year error as soon as the year is edited to a valid one", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Graduate"));
    fireEvent.changeText(screen.getByLabelText("JPCS graduation year"), "");
    fireEvent.press(screen.getByText("Graduate student"));
    await waitFor(() =>
      expect(screen.getByLabelText("JPCS graduation year").props.accessibilityHint).toBeTruthy(),
    );
    fireEvent.changeText(screen.getByLabelText("JPCS graduation year"), String(new Date().getFullYear()));
    expect(screen.getByLabelText("JPCS graduation year").props.accessibilityHint).toBeFalsy();
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

  it("flags an eight-digit year as it is typed, like the import sheet", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Graduate"));
    fireEvent.changeText(screen.getByLabelText("JPCS graduation year"), "20262026");
    expect(screen.getByLabelText("JPCS graduation year").props.accessibilityHint).toBe(
      `Enter a year between 1990 and ${new Date().getFullYear()}.`,
    );
  });

  it("drops one season's enrollment with a reason through the sheet", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    patch.mockResolvedValue({ data: { data: { id: 507, status: "WITHDRAWN" } } });
    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Seasons"));
    fireEvent.press((await screen.findAllByText("Drop"))[0]!);
    expect(screen.getByText("Drop from Spring 2099?")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Reason"), "Moved away");
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
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/students"));
    alert.mockRestore();
  });
});
