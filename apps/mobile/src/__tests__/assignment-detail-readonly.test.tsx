import { screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { assignmentDetail, essayWork, forumWork, videoWork } from "./helpers/assignment-fixtures";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

describe("AssignmentDetailScreen, read-only (a finished season)", () => {
  it("a finished season shows the checklist read-only with no Submit", async () => {
    // Every part done: an open season would offer Submit here.
    get.mockResolvedValue({
      data: {
        data: assignmentDetail([videoWork(1000), essayWork("DRAFT", 200), forumWork(true)], { readOnly: true }),
      },
    });
    renderStacked(<AssignmentDetailScreen />);

    expect(await screen.findByText("3 of 3 done")).toBeTruthy();
    expect(screen.getByText("Video: Luke 15 talk")).toBeTruthy();
    expect(screen.getByText("This season has finished. You can read your work but not change it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.queryByTestId("save-bar")).toBeNull();
    // Only the assignment is read: no forum feed, no essay.
    expect(get.mock.calls.map(([u]) => u)).toEqual(["/api/v1/assignments/41"]);
  });

  it("an unfinished assignment in a finished season names no blocker", async () => {
    get.mockResolvedValue({
      data: { data: assignmentDetail([videoWork(300), essayWork("DRAFT", 0), forumWork(false)], { readOnly: true }) },
    });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("0 of 3 done")).toBeTruthy();
    expect(screen.queryByText(/to submit$/)).toBeNull();
  });
});
