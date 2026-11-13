import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { StudentAssignmentListItem } from "@space/shared";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "55" }),
  useRouter: () => ({ push: mockPush, dismissTo: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { WorkListRow } from "../screens/work/work-row";
import { submittedSections } from "../screens/work/work-model";
import { useSessionStore } from "../store/session";
import { assignmentDetail } from "./helpers/assignment-fixtures";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const del = apiClient.delete as jest.Mock;

const parts = [
  {
    id: 3,
    position: 0,
    kind: "FORUM" as const,
    prompt: "Share one thing you noticed",
    minWords: null,
    postToRead: true,
    allowComments: true,
  },
];

const detail = {
  id: 55,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring 2099",
  title: "Week four",
  description: null,
  dueAt: null,
  dueOrgDay: null,
  dueOrgTime: null,
  isOverdue: false,
  reminder: { enabled: false, days: 2, anchor: "NEXT_SESSION" as const, time: "09:00" },
  reminderLine: null,
  parts,
  my: null,
  canManage: false,
  readOnly: false,
};

const omar = (staffMark: { markedAt: string; markedByName: string | null } | null = null) => ({
  studentUserId: 10,
  name: "Omar Student",
  avatarPath: null,
  submittedAt: null,
  staffMark,
  parts: [{ partId: 3, kind: "FORUM" as const, status: "NOT_STARTED" as const, forum: { posted: false } }],
});

const ok = (data: unknown) => Promise.resolve({ data: { data } });
const conflict = (code: string, message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message } } },
  });

function serve(progress: { canMark: boolean; rows: unknown[] }) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/assignments/55") return ok(detail);
    if (url === "/api/v1/assignments/55/progress") return ok(progress);
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3], activeSeasonId: 7 }));
});

describe("staff mark an assignment as submitted", () => {
  it("a leader marks a student from the progress list after a confirm", async () => {
    serve({ canMark: true, rows: [omar()] });
    put.mockResolvedValue({
      data: {
        data: { studentUserId: 10, markedAt: "2099-03-30T10:00:00.000Z", markedBy: { id: 1, name: "Test leader" } },
      },
    });
    renderWithProviders(<AssignmentDetailScreen />);

    const row = await screen.findByRole("button", { name: /^Omar Student/ });
    expect(row.props.accessibilityLabel).toMatch(/opens Mark as submitted$/);
    fireEvent.press(row);

    const sheet = within(await screen.findByTestId("sheet"));
    expect(
      sheet.getByText("Use this when Omar Student did it outside the app. It counts as submitted everywhere."),
    ).toBeTruthy();
    // Nothing is sent until the leader confirms in the sheet.
    expect(put).not.toHaveBeenCalled();
    fireEvent.press(sheet.getByRole("button", { name: "Mark as submitted" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/assignments/55/submitted-marks/10"));
  });

  it("a marked row says who marked it and offers Undo", async () => {
    serve({ canMark: true, rows: [omar({ markedAt: "2099-03-30T10:00:00.000Z", markedByName: "Grace Leader" })] });
    del.mockResolvedValue({ status: 204, data: "" });
    renderWithProviders(<AssignmentDetailScreen />);

    // Marked counts as submitted: the row is finished, and says who marked it.
    expect(await screen.findByText("Marked submitted by Grace Leader")).toBeTruthy();
    expect(screen.getByText("1 of 1 student finished")).toBeTruthy();
    const row = screen.getByRole("button", { name: /^Omar Student/ });
    expect(row.props.accessibilityLabel).toMatch(/opens Undo$/);
    fireEvent.press(row);

    const sheet = within(await screen.findByTestId("sheet"));
    expect(sheet.getByText("Marked submitted by Grace Leader")).toBeTruthy();
    fireEvent.press(sheet.getByRole("button", { name: "Undo, not submitted" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/assignments/55/submitted-marks/10"));
  });

  it("no action when canMark is false (finished season)", async () => {
    serve({ canMark: false, rows: [omar()] });
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Omar Student")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Omar Student/ })).toBeNull();
    expect(screen.queryByText(/mark it submitted/)).toBeNull();
  });

  it('season_finished shows "This season has ended; its work can\'t change."', async () => {
    serve({ canMark: true, rows: [omar()] });
    put.mockRejectedValue(conflict("season_finished", "This season has ended; its work can't change."));
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: /^Omar Student/ }));
    const sheet = within(await screen.findByTestId("sheet"));
    fireEvent.press(sheet.getByRole("button", { name: "Mark as submitted" }));
    expect(await sheet.findByText("This season has ended; its work can't change.")).toBeTruthy();
  });

  it('the student\'s My work row reads "Marked submitted by your leader" with Done', () => {
    const marked: StudentAssignmentListItem = {
      id: 4,
      title: "Week four",
      dueAt: null,
      dueOrgDay: null,
      isOverdue: false,
      status: "REVIEWED",
      reviewedAt: null,
      submittedAt: null,
      partsTotal: 2,
      partsDone: 0,
      returned: false,
      hasEssay: true,
      staffMarked: true,
      createdAt: "2099-01-01T00:00:00.000Z",
    };
    const [row] = submittedSections([marked], []).assignments;
    expect(row).toMatchObject({ subtitle: "Marked submitted by your leader", chip: { tone: "ok", label: "Done" } });
    renderWithProviders(<WorkListRow row={row!} />);
    expect(screen.getByText("Marked submitted by your leader")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("the student's assignment page says Done, with no Submit and no Overdue", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 10 }));
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/55"
        ? ok(assignmentDetail([], { id: 55, isOverdue: true, my: { submittedAt: null, staffMarked: true, parts: [] } }))
        : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Marked submitted by your leader")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByText("Overdue")).toBeNull();
    expect(screen.queryByText("Submit")).toBeNull();
  });
});
