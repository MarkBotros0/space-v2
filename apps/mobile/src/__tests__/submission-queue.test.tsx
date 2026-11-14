import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockParams,
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SubmissionsScreen from "../../app/(app)/submissions";

const get = apiClient.get as jest.Mock;

type ReviewStatus = "SUBMITTED" | "REVIEWED" | "RETURNED";

function queueItem(
  publicId: string,
  title: string,
  over: { isLate?: boolean; reviewStatus?: ReviewStatus; prompt?: string; studentName?: string | null } = {},
) {
  return {
    publicId,
    assignmentId: 41,
    assignmentTitle: title,
    prompt: over.prompt ?? "Who are you in the story?",
    studentName: over.studentName === undefined ? "Test student" : over.studentName,
    submittedAt: "2099-03-30T10:00:00.000Z",
    isLate: over.isLate ?? false,
    reviewStatus: over.reviewStatus ?? "SUBMITTED",
    reviewedAt:
      over.reviewStatus === "RETURNED" || over.reviewStatus === "REVIEWED" ? "2099-03-31T10:00:00.000Z" : null,
  };
}

const page = (items: unknown[], counts = { pending: 1, total: 1, late: 0 }, nextCursor: string | null = null) => ({
  data: { data: { items, counts, nextCursor } },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  // The leader has Work instead (owner 2026-11-14); the queue rows are the admin's pending list.
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 }));
});

it("the queue shows one row per essay with its prompt", async () => {
  get.mockResolvedValue(
    page(
      [
        queueItem("essay1aaaa", "Week four", { prompt: "Who are you in the story?" }),
        queueItem("essay2bbbb", "Week four", { prompt: "What would you change?" }),
      ],
      { pending: 2, total: 2, late: 0 },
    ),
  );
  renderWithProviders(<SubmissionsScreen />);

  // One student, one assignment, two essays: two rows, each with its own question.
  expect(await screen.findByText("Who are you in the story?")).toBeTruthy();
  expect(screen.getByText("What would you change?")).toBeTruthy();
  expect(screen.getAllByText("Week four")).toHaveLength(2);
  expect(screen.getAllByText("Test student")).toHaveLength(2);

  fireEvent.press(screen.getByRole("button", { name: /What would you change\?/ }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "essay2bbbb" } });
});

it("marks a late hand-in from the contract flag, and when it was handed in, as chips the row speaks", async () => {
  get.mockResolvedValue(page([queueItem("aaa1111111", "Essay one", { isLate: true })]));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Late")).toBeTruthy();
  expect(screen.getByText("Waiting review")).toBeTruthy();
  // The app's one short date-time format, in a chip that never wraps.
  expect(screen.getByText(/^Handed in [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/)).toBeTruthy();
  const row = screen.getByRole("button", { name: /^Test student/ });
  expect(row.props.accessibilityLabel).toMatch(/Waiting review, Late, Handed in /);
  // The row has no line built by hand with " · ".
  expect(row.props.accessibilityLabel).not.toMatch(/ · /);
});

it("says when a returned essay was returned, not its old hand-in date: the student has it back", async () => {
  get.mockResolvedValue(page([queueItem("aaa1111111", "Essay one", { reviewStatus: "RETURNED" })]));
  renderWithProviders(<SubmissionsScreen />);
  expect(await screen.findByText("Returned")).toBeTruthy();
  expect(screen.getByText(/^Returned [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/)).toBeTruthy();
  expect(screen.queryByText(/^Handed in /)).toBeNull();
});

it("names an unnamed student as such", async () => {
  get.mockResolvedValue(page([queueItem("aaa1111111", "Essay one", { studentName: null })]));
  renderWithProviders(<SubmissionsScreen />);
  expect(await screen.findByText("Unnamed student")).toBeTruthy();
});

it("opens from anywhere on the row, and starts loading the essay on touch-down", async () => {
  get.mockResolvedValue(page([queueItem("aaa1111111", "Essay one")]));

  renderWithProviders(<SubmissionsScreen />);
  const name = await screen.findByText("Test student");
  fireEvent(name, "pressIn");
  expect(get).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111");

  fireEvent.press(name);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/submission/[publicId]",
    params: { publicId: "aaa1111111" },
  });
});

it("keeps the tab an empty state for a student, without a request", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText(/isn't available for your role/i)).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});

it("gives an admin the pending queue", async () => {
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 }));
  get.mockResolvedValue(page([], { pending: 0, total: 0, late: 0 }));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("All caught up")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25");
});

it("a leader's old Submissions link opens their Work (owner 2026-11-14)", async () => {
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3], activeSeasonId: 7 }, { id: 5 }));
  get.mockResolvedValue({ data: { data: {} } });
  renderWithProviders(<SubmissionsScreen />);
  expect(await screen.findByRole("header", { name: "Work" })).toBeTruthy();
});
