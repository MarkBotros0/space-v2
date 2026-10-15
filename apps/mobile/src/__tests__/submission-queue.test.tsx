import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SubmissionsScreen from "../../app/(app)/submissions";

const get = apiClient.get as jest.Mock;

function queueItem(publicId: string, title: string, isLate = false) {
  return {
    publicId, status: "SUBMITTED" as const, submittedAt: "2099-03-30T10:00:00.000Z",
    isLate, assignmentId: 41, assignmentTitle: title, assignmentDueAt: null,
    seasonCode: "S26", studentUserId: 9, studentName: "Test student",
    groupId: 3, groupName: "Group A",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
});

it("lists every reviewable submission (v1, B3-8) and loads the next page from the cursor", async () => {
  get
    .mockResolvedValueOnce({
      data: { data: { items: [queueItem("aaa1111111", "Essay one")], counts: { pending: 0, total: 0, late: 0 }, nextCursor: "aaa1111111" } },
    })
    .mockResolvedValueOnce({
      data: { data: { items: [queueItem("bbb2222222", "Essay two")], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } },
    });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Essay one")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=false&limit=25");

  fireEvent.press(screen.getByText("Load more"));
  expect(await screen.findByText("Essay two")).toBeTruthy();
  expect(get).toHaveBeenLastCalledWith(
    "/api/v1/submissions?pendingOnly=false&limit=25&cursor=aaa1111111",
  );
  // Last page: the button goes away.
  expect(screen.queryByText("Load more")).toBeNull();
});

it("labels a late hand-in from the contract flag", async () => {
  get.mockResolvedValue({
    data: { data: { items: [queueItem("aaa1111111", "Essay one", true)], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } },
  });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Test student")).toBeTruthy();
  expect(screen.getByText("Group A")).toBeTruthy();
  expect(screen.getByText("Submitted")).toBeTruthy();
  expect(screen.getByText("Late")).toBeTruthy();
});

it("navigates to the review screen on press", async () => {
  get.mockResolvedValue({
    data: { data: { items: [queueItem("aaa1111111", "Essay one")], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } },
  });

  renderWithProviders(<SubmissionsScreen />);
  fireEvent.press(await screen.findByText("Test student"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/submission/[publicId]",
    params: { publicId: "aaa1111111" },
  });
});

it("shows v1's empty state for an empty queue", async () => {
  get.mockResolvedValue({ data: { data: { items: [], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } } });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("No submissions yet")).toBeTruthy();
  expect(screen.getByText("Submissions from students in your groups will appear here.")).toBeTruthy();
});

it("keeps the tab an empty state for a student, without a request", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText(/isn't available for your role/i)).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});

it("shows v1's header counts, omitting late when there are none", async () => {
  get.mockResolvedValueOnce({
    data: { data: { items: [queueItem("aaa1111111", "Essay one")], counts: { pending: 4, total: 9, late: 2 }, nextCursor: null } },
  });
  renderWithProviders(<SubmissionsScreen />);
  expect(await screen.findByText("4 pending review · 9 total · 2 late")).toBeTruthy();
  expect(screen.getByRole("header", { name: "Submissions" })).toBeTruthy();
});

it("leaves the late count out of the header when zero", async () => {
  get.mockResolvedValueOnce({
    data: { data: { items: [queueItem("aaa1111111", "Essay one")], counts: { pending: 1, total: 3, late: 0 }, nextCursor: null } },
  });
  renderWithProviders(<SubmissionsScreen />);
  expect(await screen.findByText("1 pending review · 3 total")).toBeTruthy();
});

it("keeps the pre-batch pending queue for an admin until batch 4 (plan: other roles unchanged)", async () => {
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 }));
  get.mockResolvedValue({ data: { data: { items: [], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } } });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("All caught up")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25");
});
