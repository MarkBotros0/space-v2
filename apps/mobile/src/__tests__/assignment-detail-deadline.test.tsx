import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { ScrollView } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn() },
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
import { studentDashboard } from "./helpers/dashboard-fixtures";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

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
  dueOrgDay: "2099-04-01",
  dueOrgTime: "23:59",
  isOverdue: false,
  isAllGroups: true,
  type: "STANDARD" as const,
  forumMinWords: null,
  forumAllowComments: false,
  forumPostToRead: true,
  maxFileSizeMb: 10,
  allowedMimeCategories: ["pdf" as const],
  groupIds: null,
  mySubmission: null,
  canManage: false,
  readOnly: false,
};

const submissionFor = (status: "REVIEWED" | "SUBMITTED", isLate: boolean, feedback: string | null) => ({
  id: 900,
  publicId: "abc123defg",
  status,
  text: "the work",
  feedback,
  submittedAt: "2099-03-30T10:00:00.000Z",
  reviewedAt: status === "REVIEWED" ? "2099-03-31T10:00:00.000Z" : null,
  isLate,
  assignmentId: 41,
  assignmentTitle: "Essay one",
  assignmentDueAt: null,
  assignmentDescription: null,
  seasonCode: "S26",
  studentUserId: 9,
  studentName: "Test student",
  studentEmail: "s@jpc.test",
  groupId: null,
  groupName: null,
  files: [],
  canUploadFiles: false,
  canReview: false,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(
    makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9, name: "Test student", email: "s@jpc.test" }),
  );
});

describe("AssignmentDetailScreen", () => {
  describe("the deadline once work is handed in", () => {
    const serveStatus = (
      status: "SUBMITTED" | "REVIEWED" | "RETURNED" | "DRAFT",
      over: Record<string, unknown> = {},
    ) => {
      const assignment = {
        ...detail,
        isOverdue: true,
        ...over,
        mySubmission: {
          publicId: "abc123defg",
          status,
          submittedAt: "2099-03-30T10:00:00.000Z",
          reviewedAt: null,
          feedback: null,
          isLate: false,
        },
      };
      get.mockImplementation((url: string) =>
        Promise.resolve({
          data: {
            data:
              url === "/api/v1/assignments/41" ? assignment : { ...submissionFor("SUBMITTED", false, null), status },
          },
        }),
      );
    };

    it.each(["SUBMITTED", "REVIEWED"] as const)(
      "%s on time, past the date: the date once, no Overdue and no Past due",
      async (status) => {
        serveStatus(status);
        renderStacked(<AssignmentDetailScreen />);
        expect(await screen.findByText("the work")).toBeTruthy();
        expect(screen.queryByText("Overdue")).toBeNull();
        expect(screen.queryByText(/Past due/)).toBeNull();
        expect(screen.queryByText("Due Apr 1, 2099")).toBeNull();
        expect(screen.getAllByText(/^Due /)).toHaveLength(1);
        expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
      },
    );

    it("SUBMITTED before the date has no countdown left to show", async () => {
      serveStatus("SUBMITTED", { isOverdue: false });
      renderStacked(<AssignmentDetailScreen />);
      expect(await screen.findByText("the work")).toBeTruthy();
      expect(screen.queryByText(/Due in/)).toBeNull();
      expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    });

    it("RETURNED agrees with its Work row: Returned, not Overdue, and the deadline still counts", async () => {
      serveStatus("RETURNED");
      renderStacked(<AssignmentDetailScreen />);
      expect(await screen.findByLabelText("Your response")).toBeTruthy();
      expect(screen.getByText("Returned")).toBeTruthy();
      expect(screen.queryByText("Overdue")).toBeNull();
      expect(screen.getByText(/Past due/)).toBeTruthy();
      expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    });

    it("a draft keeps Overdue and the banner, with the date", async () => {
      serveStatus("DRAFT");
      renderStacked(<AssignmentDetailScreen />);
      expect(await screen.findByLabelText("Your response")).toBeTruthy();
      expect(screen.getByText("Overdue")).toBeTruthy();
      expect(screen.getByText(/Past due/)).toBeTruthy();
      expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    });

    it("due 7+ days out: the date once, with no chip repeating it", async () => {
      get.mockResolvedValue({ data: { data: detail } });
      renderStacked(<AssignmentDetailScreen />);
      expect(await screen.findByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
      expect(screen.queryByText("Due Apr 1")).toBeNull();
    });

    it("a draft due 7+ days out: the date once too", async () => {
      serveStatus("DRAFT", { isOverdue: false });
      renderStacked(<AssignmentDetailScreen />);
      expect(await screen.findByLabelText("Your response")).toBeTruthy();
      expect(screen.queryByText("Due Apr 1")).toBeNull();
      expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    });

    it("due soon keeps the relative chip beside the date, by the server's day", async () => {
      get.mockImplementation((url: string) =>
        Promise.resolve({
          data: {
            data: url === "/api/v1/me/dashboard" ? { ...studentDashboard, todayOrgDay: "2099-03-30" } : detail,
          },
        }),
      );
      renderStacked(<AssignmentDetailScreen />);
      expect(await screen.findByText("Due in 2 days")).toBeTruthy();
      expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    });

    it("no due date names none", async () => {
      get.mockResolvedValue({
        data: { data: { ...detail, dueAt: null, dueOrgDay: null, dueOrgTime: null } },
      });
      renderStacked(<AssignmentDetailScreen />);
      expect(await screen.findByText("No due date")).toBeTruthy();
      expect(screen.queryByText(/^Due /)).toBeNull();
    });

    it("a forum post handed in uses the same chip row", async () => {
      get.mockImplementation((url: string) => {
        if (url === "/api/v1/assignments/41") {
          return Promise.resolve({
            data: {
              data: {
                ...detail,
                type: "FORUM",
                isOverdue: true,
                mySubmission: {
                  publicId: "abc123defg",
                  status: "SUBMITTED",
                  submittedAt: "2099-03-30T10:00:00.000Z",
                  reviewedAt: null,
                  feedback: null,
                  isLate: false,
                },
              },
            },
          });
        }
        return Promise.reject(new Error(`not served: ${url}`));
      });
      renderStacked(<AssignmentDetailScreen />);
      expect(await screen.findByText("Submitted")).toBeTruthy();
      expect(screen.queryByText("Overdue")).toBeNull();
      expect(screen.getAllByText(/^Due /)).toHaveLength(1);
      expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    });
  });

  describe("pull to refresh", () => {
    const pull = () =>
      act(async () => {
        screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
      });
    const summary = (status: "SUBMITTED" | "REVIEWED") => ({
      publicId: "abc123defg",
      status,
      submittedAt: "2099-03-30T10:00:00.000Z",
      reviewedAt: null,
      feedback: null,
      isLate: false,
    });
    const reads = (url: string) => get.mock.calls.filter(([u]) => u === url).length;

    it("reads the submission too, so the chip and the feedback move together", async () => {
      let reviewed = false;
      get.mockImplementation((url: string) =>
        Promise.resolve({
          data: {
            data:
              url === "/api/v1/assignments/41"
                ? { ...detail, mySubmission: summary(reviewed ? "REVIEWED" : "SUBMITTED") }
                : reviewed
                  ? submissionFor("REVIEWED", false, "Well argued.")
                  : submissionFor("SUBMITTED", false, null),
          },
        }),
      );
      renderStacked(<AssignmentDetailScreen />);
      expect(await screen.findByText("the work")).toBeTruthy();

      reviewed = true;
      await pull();
      expect(await screen.findByText("Well argued.")).toBeTruthy();
      expect(screen.getByText("Reviewed")).toBeTruthy();
    });

    it("the spinner is the pull's and holds until both reads land", async () => {
      let release: () => void = () => undefined;
      const slow = new Promise<void>((resolve) => {
        release = resolve;
      });
      let hold = false;
      get.mockImplementation(async (url: string) => {
        const isAssignment = url === "/api/v1/assignments/41";
        if (!isAssignment && hold) await slow;
        return {
          data: {
            data: isAssignment
              ? { ...detail, mySubmission: summary("SUBMITTED") }
              : submissionFor("SUBMITTED", false, null),
          },
        };
      });
      renderStacked(<AssignmentDetailScreen />);
      await screen.findByText("the work");
      const refreshing = () => screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.refreshing;
      expect(refreshing()).toBe(false);

      hold = true;
      await pull();
      expect(refreshing()).toBe(true);
      release();
      await act(async () => {
        await slow;
      });
      // The pull holds the spinner for PULL_MIN_MS however fast the reads were (iOS).
      await waitFor(() => expect(refreshing()).toBe(false), { timeout: 2000 });
    });

    it("with no submission yet, reads only the assignment", async () => {
      get.mockResolvedValue({ data: { data: detail } });
      renderStacked(<AssignmentDetailScreen />);
      await screen.findByText("Start working");
      const before = reads("/api/v1/assignments/41");
      await pull();
      expect(reads("/api/v1/assignments/41")).toBe(before + 1);
      expect(get).not.toHaveBeenCalledWith("/api/v1/submissions/null");
    });

    it("a failed pull keeps the editor and what is typed in it", async () => {
      get.mockImplementation((url: string) =>
        Promise.resolve({
          data: {
            data:
              url === "/api/v1/assignments/41"
                ? { ...detail, mySubmission: { ...summary("SUBMITTED"), status: "DRAFT" } }
                : { ...submissionFor("SUBMITTED", false, null), status: "DRAFT" },
          },
        }),
      );
      renderStacked(<AssignmentDetailScreen />);
      fireEvent.changeText(await screen.findByLabelText("Your response"), "typed here");

      patch.mockResolvedValue({ data: { data: { saved: true, submitted: false } } });
      get.mockImplementation(() => Promise.reject(new Error("blip")));
      await pull();
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
      expect(screen.getByDisplayValue("typed here")).toBeTruthy();
      expect(screen.queryByText("Something went wrong")).toBeNull();
    });
  });
});
