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

const detail = (over: Parameters<typeof assignmentDetail>[1] = {}) =>
  assignmentDetail([videoWork(0), essayWork("DRAFT", 0), forumWork(false)], over);

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(
    makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9, name: "Test student", email: "s@jpc.test" }),
  );
});

describe("AssignmentDetailScreen (student)", () => {
  it("renders title, instructions and the season from the detail contract", async () => {
    get.mockResolvedValue({ data: { data: detail() } });
    renderStacked(<AssignmentDetailScreen />);

    expect(await screen.findByText("The lost son")).toBeTruthy();
    expect(screen.getByText("Watch, write, then share.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Back" })).toHaveLength(1); // the pinned bar (R23)
    expect(screen.getByText("INSTRUCTIONS")).toBeTruthy();
    expect(screen.getByText("Spring 2026")).toBeTruthy(); // the Screen subtitle
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41");
  });

  it("shows a v2 plain-text brief verbatim, angle brackets and all", async () => {
    // v2's form stores plain text; the column also holds v1's TipTap HTML.
    get.mockResolvedValue({
      data: { data: detail({ description: "Read pages <intro> & <summary>.\nThen reflect." }) },
    });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("Read pages <intro> & <summary>.")).toBeTruthy();
    expect(screen.getByText("Then reflect.")).toBeTruthy();
  });

  it("renders a v1 HTML brief as markup", async () => {
    get.mockResolvedValue({ data: { data: detail({ description: "<p><strong>Bold</strong> brief</p>" }) } });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("Bold")).toBeTruthy();
    expect(screen.queryByText(/<strong>/)).toBeNull();
  });

  it("with no instructions, shows no empty section", async () => {
    get.mockResolvedValue({ data: { data: detail({ description: null }) } });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("0 of 3 done")).toBeTruthy();
    expect(screen.queryByText("INSTRUCTIONS")).toBeNull();
  });

  it("not-started parts say so in words, never a dash", async () => {
    get.mockResolvedValue({ data: { data: detail() } });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("0 of 3 done")).toBeTruthy();
    expect(screen.getAllByText("Not started")).toHaveLength(2);
    expect(screen.getByText("Not posted")).toBeTruthy();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("an assignment with no parts says so", async () => {
    get.mockResolvedValue({ data: { data: detail({ parts: [], my: { submittedAt: null, parts: [] } }) } });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("This assignment has no parts yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });
});
