import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { ScrollView } from "react-native";
import type { AssignmentDetail } from "@space/shared";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: mockBack,
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
}));
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import EditAssignmentScreen from "../../app/(app)/assignment/[id]/edit";
import NewAssignmentScreen from "../../app/(app)/assignment/new";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const season = {
  id: 7,
  code: "s7",
  title: "Spring 2099",
  program: "TEST",
  year: 2099,
  status: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
};
const detail: AssignmentDetail = {
  id: 55,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring 2099",
  title: "Essay one",
  description: null,
  dueAt: null,
  dueOrgDay: null,
  dueOrgTime: null,
  isOverdue: false,
  reminder: { enabled: false, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
  reminderLine: null,
  parts: [
    {
      id: 12,
      position: 0,
      kind: "ESSAY",
      prompt: "Reflect",
      minWords: null,
      maxWords: null,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
    },
  ],
  my: null,
  canManage: true,
  readOnly: false,
};
const ok = (data: unknown) => Promise.resolve({ data: { data } });
function serve(extra: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = { "/api/v1/seasons": { seasons: [season] }, ...extra };
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
  it("Save is one footer button for both tabs, outside the scroll view, with no Cancel", async () => {
    serve();
    renderStacked(<NewAssignmentScreen />);
    await screen.findByLabelText("Title");
    const inFooter = () => within(screen.getByTestId("screen-footer")).getAllByText("Create assignment");
    expect(inFooter()).toHaveLength(1);
    expect(within(screen.UNSAFE_getByType(ScrollView)).queryByTestId("save-bar")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();

    fireEvent.press(screen.getByRole("tab", { name: "Parts, 0 parts" }));
    expect(inFooter()).toHaveLength(1);
    expect(screen.getAllByTestId("save-bar")).toHaveLength(1);
  });

  it("a missing title shows on the Title field, the bar says so, and nothing is sent until it is fixed", async () => {
    mockParams = { id: "55" };
    serve({ "/api/v1/assignments/55": detail });
    patch.mockResolvedValue({ data: { data: { ...detail, reopened: 0 } } });
    renderStacked(<EditAssignmentScreen />);
    fireEvent.changeText(await screen.findByDisplayValue("Essay one"), "");
    fireEvent.press(bar().getByText("Save changes"));

    await waitFor(() => expect(screen.getByLabelText("Title").props.accessibilityHint).toBeTruthy());
    expect(bar().getByText("Fix what's marked on this tab.")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Title"), "Fixed");
    fireEvent.press(bar().getByText("Save changes"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Title").props.accessibilityHint).toBeUndefined();
  });

  it("a Details issue saved from Parts opens Details", async () => {
    mockParams = { id: "55" };
    serve({ "/api/v1/assignments/55": detail });
    renderStacked(<EditAssignmentScreen />);
    fireEvent.changeText(await screen.findByDisplayValue("Essay one"), "");
    fireEvent.press(screen.getByRole("tab", { name: "Parts, 1 part" }));
    fireEvent.press(bar().getByText("Save changes"));
    expect(screen.getByRole("tab", { name: "Details" }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText("Title").props.accessibilityHint).toBeTruthy();
  });

  it("a server refusal is the bar's hint", async () => {
    mockParams = { id: "55" };
    serve({ "/api/v1/assignments/55": detail });
    patch.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { error: { code: "x", message: "Nope, server says." } } },
      }),
    );
    renderStacked(<EditAssignmentScreen />);
    await screen.findByDisplayValue("Essay one");
    fireEvent.press(bar().getByText("Save changes"));
    expect(await bar().findByText("Nope, server says.")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("edit: Save changes from the Parts tab saves with back()", async () => {
    mockParams = { id: "55" };
    serve({ "/api/v1/assignments/55": detail });
    patch.mockResolvedValue({ data: { data: { ...detail, reopened: 0 } } });
    renderStacked(<EditAssignmentScreen />);
    await screen.findByDisplayValue("Essay one");
    fireEvent.press(screen.getByRole("tab", { name: "Parts, 1 part" }));
    fireEvent.press(bar().getByText("Save changes"));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });
});
