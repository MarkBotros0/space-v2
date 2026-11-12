import { AxiosError, type AxiosResponse } from "axios";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { assignmentDetail, essayWork, forumPart, forumWork, videoPart, videoWork } from "./helpers/assignment-fixtures";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const BLOCKER = "Finish Luke 15 talk (12 min left) and the forum post to submit";

/** 5 of 18 min watched, a draft inside its range, the forum not posted: 1 of 3 done. */
const halfway = () => assignmentDetail([videoWork(300), essayWork("DRAFT", 200), forumWork(false)]);
const finished = () => assignmentDetail([videoWork(1000), essayWork("DRAFT", 200), forumWork(true)]);

const serve = (detail: unknown) => get.mockResolvedValue({ data: { data: detail } });

const refusal = (code: string, message: string) =>
  new AxiosError("409", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 409,
    data: { error: { code, message } },
  } as AxiosResponse);

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

describe("the student's assignment: a checklist of parts", () => {
  it("the page says 1 of 3 done and lists parts in order with their status in words", async () => {
    serve(halfway());
    renderStacked(<AssignmentDetailScreen />);

    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
    expect(screen.getByText("2 parts left")).toBeTruthy();
    const rows = screen.getAllByRole("button").filter((b) => /^(Video|Essay|Forum): /.test(b.props.accessibilityLabel));
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      "Video: Luke 15 talk, Watched 5 of 18 min",
      "Essay: Who are you in the story?, Draft, 200 words",
      "Forum: Share one takeaway, Not posted",
    ]);
  });

  it("a row opens its part on its own screen", async () => {
    serve(halfway());
    renderStacked(<AssignmentDetailScreen />);
    fireEvent.press(await screen.findByText("Essay: Who are you in the story?"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/assignment/[id]/part/[partId]",
      params: { id: "41", partId: "2" },
    });
  });

  it("Submit is disabled with 'Finish Luke 15 talk (12 min left) and the forum post to submit' under it", async () => {
    serve(halfway());
    renderStacked(<AssignmentDetailScreen />);

    const bar = within(await screen.findByTestId("save-bar"));
    const submit = bar.getByRole("button", { name: "Submit" });
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });
    expect(submit.props.accessibilityHint).toBe(BLOCKER);
    expect(bar.getByText(BLOCKER)).toBeTruthy();
    fireEvent.press(submit);
    expect(post).not.toHaveBeenCalled();
  });

  it("Submit enabled when every part is done calls submit once", async () => {
    serve(finished());
    let land!: (v: unknown) => void;
    post.mockReturnValue(new Promise((resolve) => (land = resolve)));
    renderStacked(<AssignmentDetailScreen />);

    expect(await screen.findByText("3 of 3 done")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Submit" }));
    const confirm = await screen.findByText("Yes, submit");
    fireEvent.press(confirm);
    fireEvent.press(confirm);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/api/v1/assignments/41/submit");
    land({ data: { data: { submittedAt: "2099-03-30T10:00:00.000Z", completedAt: null } } });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Submitted!"));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("a refused Submit says why in words and reads the assignment again", async () => {
    serve(finished());
    post.mockRejectedValue(refusal("not_finished", BLOCKER));
    renderStacked(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "Submit" }));
    fireEvent.press(await screen.findByText("Yes, submit"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(BLOCKER));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("already submitted elsewhere: says so in words, reads again and drops Submit", async () => {
    serve(finished());
    post.mockRejectedValue(refusal("already_submitted", "You've already submitted this assignment."));
    renderStacked(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "Submit" }));
    const submitted = assignmentDetail([videoWork(1000), essayWork("SUBMITTED", 200), forumWork(true)], {
      my: {
        submittedAt: "2099-03-30T10:00:00.000Z",
        staffMarked: false,
        parts: [videoWork(1000), essayWork("SUBMITTED", 200), forumWork(true)],
      },
    });
    get.mockResolvedValue({ data: { data: submitted } });
    fireEvent.press(await screen.findByText("Yes, submit"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You've already submitted this assignment."));
    expect(await screen.findByText(/^Submitted /)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("once submitted, the page says so and offers no Submit", async () => {
    serve(
      assignmentDetail([videoWork(1000), essayWork("SUBMITTED", 200), forumWork(true)], {
        my: {
          submittedAt: "2099-03-30T10:00:00.000Z",
          staffMarked: false,
          parts: [videoWork(1000), essayWork("SUBMITTED", 200), forumWork(true)],
        },
      }),
    );
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText(/^Submitted /)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.getByText("Handed in")).toBeTruthy();
  });
});

describe("Submit's words follow the parts (review M5)", () => {
  it("with one essay: the hint and the confirmation speak of the essay", async () => {
    serve(finished());
    renderStacked(<AssignmentDetailScreen />);
    const bar = within(await screen.findByTestId("save-bar"));
    expect(bar.getByText("Your essay goes to your leader when you submit.")).toBeTruthy();
    fireEvent.press(bar.getByRole("button", { name: "Submit" }));
    expect(
      await screen.findByText("Your essay goes to your leader for review, and you can't change it after you submit."),
    ).toBeTruthy();
  });

  it("with no essay: nothing about essays or review", async () => {
    serve(assignmentDetail([videoWork(1000), forumWork(true)], { parts: [videoPart, forumPart] }));
    renderStacked(<AssignmentDetailScreen />);
    const bar = within(await screen.findByTestId("save-bar"));
    expect(bar.getByText("Every part is done. Submit to finish the assignment.")).toBeTruthy();
    expect(screen.queryByText(/essay/i)).toBeNull();
    fireEvent.press(bar.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("This marks the assignment as finished.")).toBeTruthy();
  });

  it("with a returned essay: the disabled Submit points to Hand in again on the essay", async () => {
    serve(assignmentDetail([videoWork(1000), essayWork("RETURNED", 200, "More."), forumWork(true)]));
    renderStacked(<AssignmentDetailScreen />);
    const bar = within(await screen.findByTestId("save-bar"));
    const submit = bar.getByRole("button", { name: "Submit" });
    const caption = "Open the returned essay and tap Hand in again";
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });
    expect(submit.props.accessibilityHint).toBe(caption);
    expect(bar.getByText(caption)).toBeTruthy();
  });
});
