import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, setParams: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SubmissionsScreen from "../../app/(app)/(tabs)/submissions";

const get = apiClient.get as jest.Mock;

function item(publicId: string, studentName: string | null, over: Record<string, unknown> = {}) {
  return {
    publicId,
    assignmentId: 41,
    assignmentTitle: "Week four",
    prompt: "Who are you in the story?",
    studentName,
    submittedAt: "2099-03-30T10:00:00.000Z",
    isLate: false,
    reviewStatus: "SUBMITTED" as const,
    reviewedAt: null,
    ...over,
  };
}
const page = (items: unknown[], pending: number, nextCursor: string | null = null, late = 0) => ({
  data: { data: { items, counts: { pending, total: 9, late }, nextCursor } },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
});

describe("staff pending queue (/submissions for ADMIN, SUPER, MENTOR)", () => {
  it("lists one row per essay waiting, with its assignment and question, and opens that essay", async () => {
    get.mockResolvedValue(
      page(
        [
          item("aaa1111111", "Sara"),
          item("bbb2222222", "Sara", { prompt: "What would you change?" }),
          item("ccc3333333", "Omar", { isLate: true }),
        ],
        3,
      ),
    );
    renderWithProviders(<SubmissionsScreen />);

    expect(await screen.findByText("Omar")).toBeTruthy();
    expect(screen.getAllByText("Sara")).toHaveLength(2);
    expect(screen.getAllByText("Week four")).toHaveLength(3);
    expect(screen.getAllByText("Who are you in the story?")).toHaveLength(2);
    expect(screen.getByText("What would you change?")).toBeTruthy();
    expect(screen.getByText("3 essays waiting review")).toBeTruthy();
    expect(screen.getByText("9 in all")).toBeTruthy();
    expect(screen.queryByText(/ · /)).toBeNull();
    expect(screen.getAllByText("Waiting review")).toHaveLength(3);
    expect(screen.getAllByText("Late")).toHaveLength(1);
    expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25");

    fireEvent.press(screen.getByRole("button", { name: /What would you change\?/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "bbb2222222" } });
  });

  it("adds the late count to the header only when there are late essays", async () => {
    get.mockResolvedValue(page([item("aaa1111111", "Sara", { isLate: true })], 1, null, 4));
    renderWithProviders(<SubmissionsScreen />);
    expect(await screen.findByText("1 essay waiting review")).toBeTruthy();
    expect(screen.getByText("4 handed in late")).toBeTruthy();
  });

  it("passes a valid seasonId into the request and ignores a non-numeric one", async () => {
    mockParams = { seasonId: "7" };
    get.mockResolvedValue(page([item("aaa1111111", "Sara")], 1));
    const first = renderWithProviders(<SubmissionsScreen />);
    expect(await screen.findByText("Sara")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25&seasonId=7");
    first.unmount();

    get.mockClear();
    mockParams = { seasonId: "abc" };
    renderWithProviders(<SubmissionsScreen />);
    expect(await screen.findByText("Sara")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25");
  });

  it("says All caught up when no essay is waiting", async () => {
    mockParams = { pending: "0" };
    get.mockResolvedValue(page([], 0));
    renderWithProviders(<SubmissionsScreen />);
    expect(await screen.findByText("All caught up")).toBeTruthy();
    expect(screen.getByText("No essays waiting for review.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25");
  });

  it("allows SUPER, refuses STUDENT", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockResolvedValue(page([item("aaa1111111", "Sara")], 1));
    const first = renderWithProviders(<SubmissionsScreen />);
    expect(await screen.findByText("Sara")).toBeTruthy();
    first.unmount();

    useSessionStore.setState(makeSession("STUDENT"));
    renderWithProviders(<SubmissionsScreen />);
    expect(screen.getByText("This screen isn't available for your role.")).toBeTruthy();
  });

  it("shows a retry on failure, an unnamed student as such, and Load more while paging", async () => {
    get.mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<SubmissionsScreen />);
    const retry = await screen.findByText("Try again");

    get.mockResolvedValueOnce(page([item("aaa1111111", null)], 2, "aaa1111111"));
    fireEvent.press(retry);
    expect(await screen.findByText("Unnamed student")).toBeTruthy();
    expect(screen.getByText("Load more")).toBeTruthy();
  });
});
