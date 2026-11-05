import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { ScrollView } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack, dismissTo: jest.fn(), dismissAll: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import EditAssignmentScreen from "../../app/(app)/assignment/[id]/edit";
import NewAssignmentScreen from "../../app/(app)/assignment/new";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const season = {
  id: 7, code: "s7", title: "Spring 2099", program: "TEST", year: 2099, status: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
};
const group = (id: number, name: string) => ({
  id, name, description: null, studentCount: 2, leaderNames: [], seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
});
const detail = {
  id: 55, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099", sessionId: null, sessionTitle: null,
  title: "Essay one", description: "Write about the thing.", dueAt: "2099-04-01T21:59:00.000Z",
  dueOrgDay: "2099-04-01", dueOrgTime: "23:59", isOverdue: false, isAllGroups: false, type: "STANDARD" as const,
  forumMinWords: null, forumAllowComments: false, maxFileSizeMb: 10, allowedMimeCategories: ["pdf" as const],
  groupIds: [3], mySubmission: null, canManage: true,
};
const ok = (data: unknown) => Promise.resolve({ data: { data } });
function serve(extra: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    "/api/v1/seasons": { seasons: [season] },
    "/api/v1/seasons/7/groups": { groups: [group(3, "Group A"), group(4, "Group B")] },
    "/api/v1/seasons/7/sessions": { sessions: [] },
    "/api/v1/assignments/55/tracker": { assignmentId: 55, dueAt: null, isOverdue: false, submittedCount: 0, expectedCount: 0, rows: [] },
    ...extra,
  };
  get.mockImplementation((url: string) =>
    url in table ? ok(table[url]) : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}
const bar = () => within(screen.getByTestId("save-bar"));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
});

describe("assignment form on the fixed save bar", () => {
  it("new: Create assignment lives in the screen's footer, outside the scroll view, with no own spacer or Cancel", async () => {
    serve();
    renderStacked(<NewAssignmentScreen />);
    await screen.findByLabelText("Title");
    expect(within(screen.getByTestId("screen-footer")).getByText("Create assignment")).toBeTruthy();
    expect(within(screen.UNSAFE_getByType(ScrollView)).queryByTestId("save-bar")).toBeNull();
    expect(screen.queryByTestId("form-screen-spacer")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it("a missing title shows on the Title field, the bar says so, stays usable and sends nothing", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { ...detail, id: 77 } } });
    renderStacked(<NewAssignmentScreen />);
    fireEvent.press(await screen.findByText("Create assignment"));

    await waitFor(() => expect(screen.getByLabelText("Title").props.accessibilityHint).toBeTruthy());
    expect(bar().getByText("Fix the fields marked above.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Title"), "Fixed");
    fireEvent.press(bar().getByText("Create assignment"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Title").props.accessibilityHint).toBeUndefined();
  });

  it("no groups ticked puts the schema's words on the Groups field", async () => {
    serve();
    renderStacked(<NewAssignmentScreen />);
    fireEvent.changeText(await screen.findByLabelText("Title"), "Nobody");
    fireEvent.press(screen.getByLabelText("Specific groups"));
    fireEvent.press(bar().getByText("Create assignment"));

    expect(await screen.findByText("Choose at least one group, or target the whole season.")).toBeTruthy();
    expect(bar().getByText("Fix the fields marked above.")).toBeTruthy();
  });

  it("a server refusal is the bar's hint", async () => {
    serve();
    post.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { error: { code: "x", message: "Nope, server says." } } },
      }),
    );
    renderStacked(<NewAssignmentScreen />);
    fireEvent.changeText(await screen.findByLabelText("Title"), "Reflection");
    fireEvent.press(bar().getByText("Create assignment"));
    expect(await bar().findByText("Nope, server says.")).toBeTruthy();
  });

  it("edit: Save changes is in the footer and saves with back()", async () => {
    mockParams = { id: "55" };
    serve({ "/api/v1/assignments/55": detail });
    patch.mockResolvedValue({ data: { data: detail } });
    renderStacked(<EditAssignmentScreen />);
    await screen.findByDisplayValue("Essay one");
    expect(within(screen.getByTestId("screen-footer")).getByText("Save changes")).toBeTruthy();
    fireEvent.press(bar().getByText("Save changes"));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });
});
