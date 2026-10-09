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

// v1 parity 2026-10-09 (R45, R52): v1 lists SUBMITTED, REVIEWED and RETURNED
// work in one list (submissions-query.ts:123-147) — no pending-only filter, no
// Load more. The hook follows the cursor until the last page.
it("shows every page in one list, reviewed work included, without a Load more button", async () => {
  get
    .mockResolvedValueOnce({
      data: { data: { items: [queueItem("aaa1111111", "Essay one")], counts: { pending: 0, total: 0, late: 0 }, nextCursor: "aaa1111111" } },
    })
    .mockResolvedValueOnce({
      data: {
        data: {
          items: [{ ...queueItem("bbb2222222", "Essay two"), status: "REVIEWED" as const }],
          counts: { pending: 0, total: 0, late: 0 },
          nextCursor: null,
        },
      },
    });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Essay one")).toBeTruthy();
  expect(await screen.findByText("Essay two")).toBeTruthy();
  expect(screen.getByText("Reviewed")).toBeTruthy();
  expect(get).toHaveBeenNthCalledWith(1, "/api/v1/submissions?pendingOnly=false&limit=100");
  expect(get).toHaveBeenNthCalledWith(2, "/api/v1/submissions?pendingOnly=false&limit=100&cursor=aaa1111111");
  expect(screen.queryByText("Load more")).toBeNull();
});

it("labels a late hand-in from the contract flag", async () => {
  get.mockResolvedValue({
    data: { data: { items: [queueItem("aaa1111111", "Essay one", true)], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } },
  });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Test student · Group A · Late")).toBeTruthy();
});

it("navigates to the review screen on press", async () => {
  get.mockResolvedValue({
    data: { data: { items: [queueItem("aaa1111111", "Essay one")], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } },
  });

  renderWithProviders(<SubmissionsScreen />);
  fireEvent.press(await screen.findByText("Essay one"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/submission/[publicId]",
    params: { publicId: "aaa1111111" },
  });
});

it("shows v1's empty state for an empty queue", async () => {
  get.mockResolvedValue({ data: { data: { items: [], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } } });

  renderWithProviders(<SubmissionsScreen />);

  // v1 leader-queue-list.tsx:72-75.
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
});

it("leaves the late count out of the header when zero", async () => {
  get.mockResolvedValueOnce({
    data: { data: { items: [queueItem("aaa1111111", "Essay one")], counts: { pending: 1, total: 3, late: 0 }, nextCursor: null } },
  });
  renderWithProviders(<SubmissionsScreen />);
  expect(await screen.findByText("1 pending review · 3 total")).toBeTruthy();
});
