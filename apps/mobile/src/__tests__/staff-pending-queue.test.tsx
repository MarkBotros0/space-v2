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
    publicId, status: "SUBMITTED" as const, submittedAt: "2099-03-30T10:00:00.000Z",
    isLate: false, assignmentId: 41, assignmentTitle: "Essay one", assignmentDueAt: null,
    seasonCode: "S26", studentUserId: 9, studentName, groupId: 3, groupName: "Group A", ...over,
  };
}
const page = (items: unknown[], pending: number, nextCursor: string | null = null) => ({
  data: { data: { items, counts: { pending, total: 9, late: 0 }, nextCursor } },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
});

describe("staff pending queue (/submissions for ADMIN, SUPER, MENTOR)", () => {
  it("titles the screen, shows a header count equal to the rows, and opens a submission", async () => {
    get.mockResolvedValue(page([item("aaa1111111", "Sara"), item("bbb2222222", "Omar", { isLate: true })], 2));
    renderWithProviders(<SubmissionsScreen />);

    expect(await screen.findByText("Sara")).toBeTruthy();
    expect(screen.getByText("Omar")).toBeTruthy();
    expect(screen.getByText("2 waiting for review")).toBeTruthy();
    expect(screen.getAllByText("Essay one · Group A")).toHaveLength(2);
    expect(screen.getAllByText("Submitted")).toHaveLength(2);
    expect(screen.getAllByText("Late")).toHaveLength(1);
    expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25");

    fireEvent.press(screen.getByText("Sara"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "aaa1111111" } });
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

  it("ignores a stray pending param: the staff branch is always the pending queue", async () => {
    mockParams = { pending: "0" };
    get.mockResolvedValue(page([], 0));
    renderWithProviders(<SubmissionsScreen />);
    expect(await screen.findByText("All caught up")).toBeTruthy();
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

    get.mockResolvedValueOnce(page([item("aaa1111111", null, { groupName: null })], 2, "aaa1111111"));
    fireEvent.press(retry);
    expect(await screen.findByText("Unnamed")).toBeTruthy();
    expect(screen.getByText("Essay one")).toBeTruthy();
    expect(screen.getByText("Load more")).toBeTruthy();
  });
});
