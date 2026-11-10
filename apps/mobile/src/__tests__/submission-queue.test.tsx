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
import SubmissionsScreen from "../../app/(app)/(tabs)/submissions";
import { queueSections } from "../screens/leader-submissions/queue-sections";

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
  };
}

const page = (items: unknown[], counts = { pending: 1, total: 1, late: 0 }, nextCursor: string | null = null) => ({
  data: { data: { items, counts, nextCursor } },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
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

it("lists every essay handed in (v1, B3-8) and loads the next page from the cursor", async () => {
  get
    .mockResolvedValueOnce(
      page([queueItem("aaa1111111", "Essay one")], { pending: 2, total: 5, late: 0 }, "aaa1111111"),
    )
    // A cursor page carries no counts; the header keeps the first page's.
    .mockResolvedValueOnce({
      data: { data: { items: [queueItem("bbb2222222", "Essay two")], counts: null, nextCursor: null } },
    });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Essay one")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=false&limit=25");

  fireEvent.press(screen.getByText("Load more"));
  expect(await screen.findByText("Essay two")).toBeTruthy();
  expect(get).toHaveBeenLastCalledWith("/api/v1/submissions?pendingOnly=false&limit=25&cursor=aaa1111111");
  expect(screen.queryByText("Load more")).toBeNull();
  // One fact per line, never a " · " line: the screen's subtitle, then the totals under it.
  expect(screen.getByText("2 essays waiting review")).toBeTruthy();
  expect(screen.getByText("5 in all")).toBeTruthy();
  expect(screen.queryByText(/handed in late/)).toBeNull();
  expect(screen.queryByText(/ · /)).toBeNull();
});

it("narrows to the dashboard's season when opened with one, and says so", async () => {
  mockParams = { seasonId: "7" };
  get.mockResolvedValue(page([queueItem("aaa1111111", "Essay one")]));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Essay one")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=false&limit=25&seasonId=7");
  expect(screen.getByText("Current season only")).toBeTruthy();
  fireEvent.press(screen.getByText("Show all seasons"));
  expect(mockSetParams).toHaveBeenCalledWith({ seasonId: undefined });
});

it("ignores a malformed season param and shows every season", async () => {
  mockParams = { seasonId: "abc" };
  get.mockResolvedValue(page([], { pending: 0, total: 0, late: 0 }));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("No essays yet")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=false&limit=25");
  expect(screen.queryByText("Show all seasons")).toBeNull();
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

it("shows no hand-in date on a returned essay: the student has it back", async () => {
  get.mockResolvedValue(page([queueItem("aaa1111111", "Essay one", { reviewStatus: "RETURNED" })]));
  renderWithProviders(<SubmissionsScreen />);
  expect(await screen.findByText("Returned")).toBeTruthy();
  expect(screen.queryByText(/^Handed in /)).toBeNull();
});

it("names an unnamed student as such", async () => {
  get.mockResolvedValue(page([queueItem("aaa1111111", "Essay one", { studentName: null })]));
  renderWithProviders(<SubmissionsScreen />);
  expect(await screen.findByText("Unnamed student")).toBeTruthy();
});

it("groups the queue into waiting and reviewed sections, omitting an empty one", async () => {
  get.mockResolvedValue(
    page([queueItem("aaa1111111", "Essay one"), queueItem("bbb2222222", "Essay two", { reviewStatus: "REVIEWED" })], {
      pending: 1,
      total: 2,
      late: 0,
    }),
  );

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("WAITING FOR REVIEW")).toBeTruthy();
  expect(screen.getByText("REVIEWED", { exact: true })).toBeTruthy();
});

it("shows only the waiting section when nothing is reviewed", async () => {
  get.mockResolvedValue(page([queueItem("aaa1111111", "Essay one")]));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("WAITING FOR REVIEW")).toBeTruthy();
  expect(screen.queryByText("REVIEWED")).toBeNull();
});

describe("queueSections", () => {
  it("splits essays waiting review from the rest and keeps order", () => {
    const items = [
      queueItem("a", "A"),
      queueItem("b", "B", { reviewStatus: "REVIEWED" }),
      queueItem("c", "C"),
      queueItem("d", "D", { reviewStatus: "RETURNED" }),
    ];
    const { waiting, done } = queueSections(items);
    expect(waiting.map((i) => i.publicId)).toEqual(["a", "c"]);
    expect(done.map((i) => i.publicId)).toEqual(["b", "d"]);
  });
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

it("shows an empty state in words for an empty queue", async () => {
  get.mockResolvedValue(page([], { pending: 0, total: 0, late: 0 }));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("No essays yet")).toBeTruthy();
  expect(screen.getByText("Essays from students in your groups appear here once they submit.")).toBeTruthy();
});

it("keeps the tab an empty state for a student, without a request", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText(/isn't available for your role/i)).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});

it("counts the header in words, one fact per line, with late only when there are some", async () => {
  get.mockResolvedValueOnce(page([queueItem("aaa1111111", "Essay one")], { pending: 1, total: 9, late: 2 }));
  renderWithProviders(<SubmissionsScreen />);
  expect(await screen.findByText("1 essay waiting review")).toBeTruthy();
  expect(screen.getByText("9 in all")).toBeTruthy();
  expect(screen.getByText("2 handed in late")).toBeTruthy();
  expect(screen.getByRole("header", { name: "Submissions" })).toBeTruthy();
});

it("gives an admin the pending queue", async () => {
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 }));
  get.mockResolvedValue(page([], { pending: 0, total: 0, late: 0 }));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("All caught up")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25");
});
