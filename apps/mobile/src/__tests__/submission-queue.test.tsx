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

it("lists the pending queue and loads the next page from the cursor", async () => {
  get
    .mockResolvedValueOnce({
      data: { data: { items: [queueItem("aaa1111111", "Essay one")], counts: { pending: 0, total: 0, late: 0 }, nextCursor: "aaa1111111" } },
    })
    .mockResolvedValueOnce({
      data: { data: { items: [queueItem("bbb2222222", "Essay two")], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } },
    });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Essay one")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25");

  fireEvent.press(screen.getByText("Load more"));
  expect(await screen.findByText("Essay two")).toBeTruthy();
  expect(get).toHaveBeenLastCalledWith(
    "/api/v1/submissions?pendingOnly=true&limit=25&cursor=aaa1111111",
  );
  // Last page: the button goes away.
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

it("shows 'All caught up' for an empty queue", async () => {
  get.mockResolvedValue({ data: { data: { items: [], counts: { pending: 0, total: 0, late: 0 }, nextCursor: null } } });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("All caught up")).toBeTruthy();
});

it("keeps the tab an empty state for a student, without a request", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText(/isn't available for your role/i)).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});
