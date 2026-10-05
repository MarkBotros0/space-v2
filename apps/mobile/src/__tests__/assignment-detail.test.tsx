import { screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]";

const get = apiClient.get as jest.Mock;

const detail = {
  id: 41,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  sessionId: null,
  sessionTitle: null,
  title: "Essay one",
  description: "Write about the thing.",
  dueAt: "2099-04-01T21:59:00.000Z",
  isOverdue: false,
  isAllGroups: true,
  type: "STANDARD" as const,
  forumMinWords: null,
  forumAllowComments: false,
  maxFileSizeMb: 10,
  allowedMimeCategories: ["pdf" as const],
  groupIds: null,
  mySubmission: null,
  canManage: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(
    makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9, name: "Test student", email: "s@jpc.test" }),
  );
});

describe("AssignmentDetailScreen", () => {
  it("renders title, description and due date from the detail contract", async () => {
    get.mockResolvedValue({ data: { data: detail } });

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(screen.getByText("Write about the thing.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41");
  });

  it("shows reviewed feedback from mySubmission", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          ...detail,
          mySubmission: {
            publicId: "abc123defg",
            status: "REVIEWED",
            submittedAt: "2099-03-30T10:00:00.000Z",
            reviewedAt: "2099-03-31T10:00:00.000Z",
            feedback: "Solid work.",
            isLate: false,
          },
        },
      },
    });

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Solid work.")).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
  });

  it("shows the late badge from the contract flag", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          ...detail,
          mySubmission: {
            publicId: "abc123defg",
            status: "SUBMITTED",
            submittedAt: "2099-04-02T10:00:00.000Z",
            reviewedAt: null,
            feedback: null,
            isLate: true,
          },
        },
      },
    });

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Submitted late")).toBeTruthy();
  });
});
