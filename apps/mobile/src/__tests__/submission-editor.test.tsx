import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";

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

import { AccessibilityInfo, Keyboard } from "react-native";

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");

const detailNoSubmission = {
  id: 41, seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
  sessionId: null, sessionTitle: null, title: "Essay one",
  description: null, dueAt: null, dueOrgDay: null, dueOrgTime: null, isOverdue: false, isAllGroups: true,
  type: "STANDARD" as const, forumMinWords: null, forumAllowComments: false,
  maxFileSizeMb: 10, allowedMimeCategories: [], groupIds: null,
  mySubmission: null, canManage: false,
};

const draftSummary = {
  publicId: "abc123defg", status: "DRAFT" as const, submittedAt: null,
  reviewedAt: null, feedback: null, isLate: false,
};

const submissionDetail = {
  id: 900, publicId: "abc123defg", status: "DRAFT" as const,
  text: "first draft", feedback: null,
  submittedAt: null, reviewedAt: null, isLate: false,
  assignmentId: 41, assignmentTitle: "Essay one", assignmentDueAt: null,
  assignmentDescription: null, seasonCode: "S26",
  studentUserId: 9, studentName: "Test student", studentEmail: "s@jpc.test", groupId: null, groupName: null,
  files: [], canUploadFiles: false, canReview: false,
};

function serve(assignment: unknown) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/assignments/41"
      ? Promise.resolve({ data: { data: assignment } })
      : Promise.resolve({ data: { data: submissionDetail } }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(
    makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9, name: "Test student", email: "s@jpc.test" }),
  );
});

describe("submission editor", () => {
  it("starts a submission via the idempotent PUT, then loads its text", async () => {
    // The PUT's onSuccess invalidates the assignment detail; the refetch must
    // then see the submission it created, or the editor never appears. Model
    // that state change: null before the PUT resolves, a row after.
    let submissionStarted = false;
    put.mockImplementation(() => {
      submissionStarted = true;
      return Promise.resolve({ data: { data: { publicId: "abc123defg", status: "DRAFT" } } });
    });
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({
            data: {
              data: submissionStarted
                ? { ...detailNoSubmission, mySubmission: draftSummary }
                : detailNoSubmission,
            },
          })
        : Promise.resolve({ data: { data: submissionDetail } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.press(await screen.findByText("Start working"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/submissions/by-assignment/41"),
    );
    expect(await screen.findByDisplayValue("first draft")).toBeTruthy();
  });

  it("saves a draft without submitting, and submits explicitly", async () => {
    serve({ ...detailNoSubmission, mySubmission: draftSummary });
    patch.mockResolvedValue({ data: { data: { saved: true, submitted: false } } });

    renderWithProviders(<AssignmentDetailScreen />);

    const input = await screen.findByLabelText("Your response");
    fireEvent.changeText(input, "better draft");

    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/submissions/abc123defg", {
        text: "better draft",
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Draft saved."));

    patch.mockResolvedValue({ data: { data: { saved: true, submitted: true } } });
    fireEvent.press(screen.getByText("Submit"));
    // Submitting is irreversible, so it waits for an explicit confirmation.
    expect(await screen.findByText("Submit your work?")).toBeTruthy();
    expect(patch).not.toHaveBeenCalledWith("/api/v1/submissions/abc123defg", expect.objectContaining({ submit: true }));
    fireEvent.press(screen.getByText("Yes, submit"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/submissions/abc123defg", {
        text: "better draft",
        submit: true,
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Submitted!"));
  });

  it("backs out of the confirmation without submitting", async () => {
    serve({ ...detailNoSubmission, mySubmission: draftSummary });
    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByLabelText("Your response");

    fireEvent.press(screen.getByText("Submit"));
    fireEvent.press(await screen.findByText("Not yet"));

    await waitFor(() => expect(screen.queryByText("Submit your work?")).toBeNull());
    expect(patch).not.toHaveBeenCalled();
  });

  it("disables Submit while the text is empty and nothing is attached (REG-85)", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: { ...detailNoSubmission, mySubmission: draftSummary } } })
        : Promise.resolve({ data: { data: { ...submissionDetail, text: "" } } }),
    );
    renderWithProviders(<AssignmentDetailScreen />);

    const input = await screen.findByLabelText("Your response");
    const submitDisabled = () => screen.getByRole("button", { name: "Submit" }).props.accessibilityState?.disabled;
    expect(submitDisabled()).toBe(true);
    fireEvent.changeText(input, "   ");
    expect(submitDisabled()).toBe(true);
    fireEvent.changeText(input, "an answer");
    expect(submitDisabled()).toBe(false);
    expect(screen.getByRole("button", { name: "Submit" }).props.accessibilityHint).toBeUndefined();
    expect(screen.queryByText(/Write a response first/)).toBeNull();
  });

  it("lets Submit through with no text when a file is already attached (REG-85)", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: { ...detailNoSubmission, mySubmission: draftSummary } } })
        : Promise.resolve({
            data: {
              data: {
                ...submissionDetail,
                text: "",
                files: [{ id: 5, originalName: "essay.pdf", mimeType: "application/pdf", sizeBytes: 1200 }],
              },
            },
          }),
    );
    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByLabelText("Your response");
    expect(screen.getByRole("button", { name: "Submit" }).props.accessibilityState?.disabled).toBeFalsy();
  });

  it("surfaces a malformed save response as an error instead of trusting it", async () => {
    // Parse, don't cast (ruling X10): a drifted payload must fail loudly.
    serve({ ...detailNoSubmission, mySubmission: draftSummary });
    patch.mockResolvedValue({ data: { data: { saved: "yes" } } });

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.press(await screen.findByText("Save draft"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't save. Check your connection and try again."),
    );
  });

  it("explains why attachments are unavailable instead of showing a dead control", async () => {
    serve({ ...detailNoSubmission, mySubmission: draftSummary });

    renderWithProviders(<AssignmentDetailScreen />);

    // canUploadFiles=false + maxFileSizeMb set: the assignment expects a file
    // the app cannot take yet. Say so; never render an attach button that 503s.
    expect(await screen.findByText(/attachments aren't available/i)).toBeTruthy();
  });
});

const withStatus = (status: "DRAFT" | "RETURNED" | "REVIEWED", text = "first draft") => {
  get.mockImplementation((url: string) =>
    Promise.resolve({
      data: {
        data:
          url === "/api/v1/assignments/41"
            ? { ...detailNoSubmission, mySubmission: { ...draftSummary, status } }
            : { ...submissionDetail, status, text },
      },
    }),
  );
};
const bar = () => within(screen.getByTestId("save-bar"));

describe("submission editor: the fixed save bar", () => {
  it("no submission: Start working is the bar's primary and nothing else is offered", async () => {
    serve(detailNoSubmission);
    put.mockResolvedValue({ data: { data: { publicId: "abc123defg", status: "DRAFT" } } });
    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByTestId("save-bar");
    fireEvent.press(bar().getByText("Start working"));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/submissions/by-assignment/41"));
    expect(screen.queryByText("Save draft")).toBeNull();
    expect(screen.queryByText("Submit")).toBeNull();
  });

  it("a draft with no text: Submit is disabled, Save draft is not", async () => {
    withStatus("DRAFT", "");
    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByLabelText("Your response");
    expect(bar().getByRole("button", { name: "Submit" }).props.accessibilityState?.disabled).toBe(true);
    expect(bar().getByRole("button", { name: "Save draft" }).props.accessibilityState?.disabled).toBeFalsy();
    expect(bar().getByText(/^Write a response first\. A saved draft is private to you/)).toBeTruthy();
    expect(bar().getByRole("button", { name: "Submit" }).props.accessibilityHint).toBe("Write a response first");
  });

  it("returned work is editable, and the confirmation says it will be reviewed again", async () => {
    withStatus("RETURNED");
    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByLabelText("Your response");
    fireEvent.press(bar().getByText("Submit"));
    expect(await screen.findByText(/review this again/)).toBeTruthy();
  });

  it("reviewed work is read-only with no bar", async () => {
    withStatus("REVIEWED", "the final work");
    renderWithProviders(<AssignmentDetailScreen />);
    expect(await screen.findByText("the final work")).toBeTruthy();
    expect(screen.queryByTestId("save-bar")).toBeNull();
    expect(screen.queryByLabelText("Your response")).toBeNull();
  });

  it("a failed save shows the server's message and keeps what was typed", async () => {
    withStatus("DRAFT");
    patch.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { error: { code: "deadline_closed", message: "This assignment is closed." } } },
      }),
    );
    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.changeText(await screen.findByLabelText("Your response"), "my words");
    fireEvent.press(bar().getByText("Save draft"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This assignment is closed."));
    expect(screen.getByDisplayValue("my words")).toBeTruthy();
  });

  it("a failed submit reads as an error, closes the dialog and keeps the text", async () => {
    withStatus("DRAFT");
    patch.mockRejectedValue(new Error("Network Error"));
    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByLabelText("Your response");
    fireEvent.press(bar().getByText("Submit"));
    fireEvent.press(await screen.findByText("Yes, submit"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't submit. Check your connection and try again."),
    );
    await waitFor(() => expect(screen.queryByText("Submit your work?")).toBeNull());
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("first draft")).toBeTruthy();
  });

  it("nothing about a save stays on the page to go stale after further typing", async () => {
    withStatus("DRAFT");
    patch.mockResolvedValue({ data: { data: { saved: true, submitted: false } } });
    renderWithProviders(<AssignmentDetailScreen />);
    const input = await screen.findByLabelText("Your response");
    fireEvent.press(bar().getByText("Save draft"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Draft saved."));
    expect(announce).toHaveBeenCalledWith("Draft saved.");
    fireEvent.changeText(input, "more words");
    expect(screen.queryByText("Draft saved.")).toBeNull();
  });

  it("the server's overdue flag says Past due whatever the device clock", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data:
            url === "/api/v1/assignments/41"
              ? { ...detailNoSubmission, dueAt: "2099-01-01T00:00:00.000Z", dueOrgDay: "2099-01-01", isOverdue: true, mySubmission: draftSummary }
              : submissionDetail,
        },
      }),
    );
    renderWithProviders(<AssignmentDetailScreen />);
    expect(await screen.findByText(/Past due/)).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
  });

  it("with the keyboard open the footer drops the hint and sets Save draft beside Submit", async () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const spy = jest.spyOn(Keyboard, "addListener").mockImplementation(((
      event: string,
      cb: never,
    ) => {
      (listeners[event] ??= []).push(cb);
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    withStatus("DRAFT");
    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByLabelText("Your response");
    expect(bar().getByText(/not sent to your leader/)).toBeTruthy();

    // The keyboard arms Screen's scroll-into-view retries; on real timers one fires
    // after the environment is gone and fails whichever suite runs next.
    jest.useFakeTimers();
    act(() => {
      for (const cb of listeners.keyboardWillShow ?? listeners.keyboardDidShow ?? []) {
        cb({ endCoordinates: { height: 300, screenY: 400 } });
      }
    });

    expect(bar().queryByText(/not sent to your leader/)).toBeNull();
    const submit = bar().getByRole("button", { name: "Submit" });
    const draft = bar().getByRole("button", { name: "Save draft" });
    expect(submit).toBeTruthy();
    expect(draft).toBeTruthy();
    screen.unmount();
    jest.useRealTimers();
    spy.mockRestore();
  });

  it("every section label on the screen is the kit header, at the same indent", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data:
            url === "/api/v1/assignments/41"
              ? { ...detailNoSubmission, description: "Do the thing.", mySubmission: draftSummary }
              : { ...submissionDetail, feedback: "Nice work." },
        },
      }),
    );
    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByLabelText("Your response");
    const names = screen.getAllByRole("header").map((h) => String(h.props.children));
    expect(names).toEqual(expect.arrayContaining(["BRIEF", "YOUR SUBMISSION", "LEADER FEEDBACK"]));
  });
});
