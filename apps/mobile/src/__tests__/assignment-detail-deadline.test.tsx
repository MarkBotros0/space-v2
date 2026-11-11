import { act, screen, waitFor } from "@testing-library/react-native";
import { ScrollView } from "react-native";

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

const works = [videoWork(300), essayWork("DRAFT", 200), forumWork(false)];
const serve = (over: Parameters<typeof assignmentDetail>[1] = {}) =>
  get.mockResolvedValue({ data: { data: assignmentDetail(works, over) } });

const pull = () =>
  act(async () => {
    screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
  });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

describe("AssignmentDetailScreen: the deadline", () => {
  it("names the server's org day and time once", async () => {
    serve();
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    expect(screen.getAllByText(/^Due /)).toHaveLength(1);
    expect(screen.queryByText("Overdue")).toBeNull();
  });

  it("no due date says so in words", async () => {
    serve({ dueAt: null, dueOrgDay: null, dueOrgTime: null });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("No due date")).toBeTruthy();
  });

  it("past the date and not submitted: Overdue, in words beside the date", async () => {
    serve({ isOverdue: true });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
  });

  it("past the date but submitted: no Overdue left to show", async () => {
    serve({ isOverdue: true, my: { submittedAt: "2099-03-30T10:00:00.000Z", parts: works } });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText(/^Submitted /)).toBeTruthy();
    expect(screen.queryByText("Overdue")).toBeNull();
  });

  it("a finished season counts down to nothing", async () => {
    serve({ isOverdue: true, readOnly: true });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
    expect(screen.queryByText("Overdue")).toBeNull();
  });
});

describe("AssignmentDetailScreen: pull to refresh", () => {
  it("reads the assignment again, so the parts move together", async () => {
    serve();
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();

    get.mockResolvedValue({
      data: { data: assignmentDetail([videoWork(1000), essayWork("DRAFT", 200), forumWork(false)]) },
    });
    await pull();
    expect(await screen.findByText("2 of 3 done")).toBeTruthy();
  });

  it("a failed pull keeps the page", async () => {
    serve();
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
    get.mockRejectedValue(new Error("blip"));
    await pull();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});
