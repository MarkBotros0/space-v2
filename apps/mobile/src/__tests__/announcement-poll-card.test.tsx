import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";

jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import type { AnnouncementPoll } from "@space/shared";

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { PollCard } from "../screens/announcements/poll/poll-card";
import { detailItem, ok, pollItem } from "./helpers/announcements";
import { renderWithProviders } from "./helpers/render";

const api = apiClient as unknown as Record<"get" | "post" | "put", jest.Mock>;

const render = (over: Partial<AnnouncementPoll> = {}) =>
  renderWithProviders(<PollCard postId={7} poll={pollItem(over) as AnnouncementPoll} />);

const conflict = (code: string, message = "Conflict") =>
  new AxiosError("409", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 409,
    data: { error: { code, message } },
  } as AxiosResponse);

beforeEach(() => jest.clearAllMocks());

describe("PollCard", () => {
  it("a reader who hasn't voted sees radios and a disabled Vote that a pick enables", () => {
    render();
    expect(screen.getByText("Poll · Pick one")).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    const vote = screen.getByRole("button", { name: "Vote" });
    expect(vote.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByLabelText("Saturday"));
    expect(screen.getByLabelText("Saturday").props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole("button", { name: "Vote" }).props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it("one answer: a second pick replaces the first", () => {
    render();
    fireEvent.press(screen.getByLabelText("Saturday"));
    fireEvent.press(screen.getByLabelText("Sunday"));
    expect(screen.getByLabelText("Saturday").props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByLabelText("Sunday").props.accessibilityState).toMatchObject({ checked: true });
  });

  it("a several-answer poll renders checkboxes and keeps every pick", () => {
    render({ allowsMultiple: true });
    expect(screen.getByText("Poll · Pick any")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.press(screen.getByLabelText("Saturday"));
    fireEvent.press(screen.getByLabelText("Sunday"));
    expect(screen.getByLabelText("Saturday").props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText("Sunday").props.accessibilityState).toMatchObject({ checked: true });
  });

  it("Vote sends the version and the picks", async () => {
    api.put.mockReturnValue(ok(detailItem(7, { poll: pollItem({ myOptionIds: [1] }) })));
    render({ version: 3 });
    fireEvent.press(screen.getByLabelText("Saturday"));
    fireEvent.press(screen.getByRole("button", { name: "Vote" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/api/v1/announcements/7/poll/vote", { version: 3, optionIds: [1] }),
    );
  });

  it("after voting: results, Your vote in words and the row's label with percent", () => {
    render({ myOptionIds: [1], voterCount: 5, options: [opt(1, "Saturday", 2), opt(2, "Sunday", 3)] });
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText("Your vote")).toBeTruthy();
    expect(screen.getByLabelText("Saturday, 2 votes, 40 percent, your vote")).toBeTruthy();
    expect(screen.getByLabelText("Sunday, 3 votes, 60 percent")).toBeTruthy();
    expect(screen.getByText("5 people voted")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change vote" })).toBeTruthy();
  });

  it("says 1 vote and 1 person, and 0 percent with no voters", () => {
    const one = render({ myOptionIds: [1], voterCount: 1, options: [opt(1, "Saturday", 1), opt(2, "Sunday", 0)] });
    expect(screen.getByLabelText("Saturday, 1 vote, 100 percent, your vote")).toBeTruthy();
    expect(screen.getByText("1 person voted")).toBeTruthy();
    one.unmount();
    render({ canManage: true, voterCount: 0, options: [opt(1, "Saturday", 0), opt(2, "Sunday", 0)] });
    expect(screen.getByLabelText("Saturday, 0 votes, 0 percent")).toBeTruthy();
  });

  it("Change vote returns to the choices with the pick ticked", () => {
    render({ myOptionIds: [2], voterCount: 1, options: [opt(1, "Saturday", 0), opt(2, "Sunday", 1)] });
    fireEvent.press(screen.getByRole("button", { name: "Change vote" }));
    expect(screen.getByLabelText("Sunday").props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText("Saturday").props.accessibilityState).toMatchObject({ checked: false });
  });

  it("a closed poll shows results with no Vote or Change vote", () => {
    render({
      closed: true,
      canVote: false,
      myOptionIds: [1],
      voterCount: 1,
      options: [opt(1, "Saturday", 1), opt(2, "Sunday", 0)],
    });
    expect(screen.getByText("Closed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Vote" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change vote" })).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("a reader who may not vote or see counts gets the options alone, with no invented zeros", () => {
    render({ canVote: false });
    expect(screen.getByText("Saturday")).toBeTruthy();
    expect(screen.queryByText(/people voted|person voted/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Vote" })).toBeNull();
  });

  it("a manager who hasn't voted sees results plus a Vote pill that opens the choices", () => {
    render({ canManage: true, voterCount: 2, options: [opt(1, "Saturday", 2), opt(2, "Sunday", 0)] });
    expect(screen.getByLabelText("Saturday, 2 votes, 100 percent")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Vote" }));
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("a Super on a season poll sees no Vote pill, but See who voted and Close poll", () => {
    render({
      canVote: false,
      canManage: true,
      canSeeNames: true,
      voterCount: 0,
      options: [opt(1, "Saturday", 0), opt(2, "Sunday", 0)],
    });
    expect(screen.queryByRole("button", { name: "Vote" })).toBeNull();
    expect(screen.getByRole("button", { name: "See who voted" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close poll" })).toBeTruthy();
  });

  it("Close poll and Reopen poll post to the poll", async () => {
    api.post.mockReturnValue(ok(detailItem(7, { poll: pollItem({ closed: true }) })));
    const first = render({ canManage: true, voterCount: 0, options: [opt(1, "Saturday", 0), opt(2, "Sunday", 0)] });
    fireEvent.press(screen.getByRole("button", { name: "Close poll" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/announcements/7/poll/close"));
    first.unmount();
    render({
      closed: true,
      canVote: false,
      canManage: true,
      voterCount: 0,
      options: [opt(1, "Saturday", 0), opt(2, "Sunday", 0)],
    });
    fireEvent.press(screen.getByRole("button", { name: "Reopen poll" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/announcements/7/poll/reopen"));
  });

  it("the voters sheet lists names by option, Former member for a deleted account", async () => {
    api.get.mockReturnValue(
      ok({
        options: [
          { id: 1, label: "Saturday", voters: [{ name: "Mina Saad" }, { name: null }] },
          { id: 2, label: "Sunday", voters: [] },
        ],
      }),
    );
    render({
      canManage: true,
      canSeeNames: true,
      voterCount: 2,
      options: [opt(1, "Saturday", 2), opt(2, "Sunday", 0)],
    });
    fireEvent.press(screen.getByRole("button", { name: "See who voted" }));
    expect(await screen.findByText("Mina Saad")).toBeTruthy();
    expect(screen.getByText("Former member")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("/api/v1/announcements/7/poll/voters");
  });

  it("a Super on a finished season's poll sees who voted, but no Close or Reopen", async () => {
    api.get.mockReturnValue(
      ok({
        options: [
          { id: 1, label: "Saturday", voters: [{ name: "Mina Saad" }] },
          { id: 2, label: "Sunday", voters: [] },
        ],
      }),
    );
    render({
      closed: true,
      canVote: false,
      canManage: false,
      canSeeNames: true,
      voterCount: 1,
      options: [opt(1, "Saturday", 1), opt(2, "Sunday", 0)],
    });
    expect(screen.queryByRole("button", { name: "Close poll" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reopen poll" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "See who voted" }));
    expect(await screen.findByText("Mina Saad")).toBeTruthy();
  });

  it("a manager flag alone does not open names: See who voted follows canSeeNames", () => {
    render({
      canManage: true,
      canSeeNames: false,
      voterCount: 0,
      options: [opt(1, "Saturday", 0), opt(2, "Sunday", 0)],
    });
    expect(screen.queryByRole("button", { name: "See who voted" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close poll" })).toBeTruthy();
  });

  it("poll_changed: a toast, and back to the choices with nothing ticked", async () => {
    api.put.mockRejectedValue(conflict("poll_changed"));
    api.get.mockReturnValue(ok(detailItem(7, { poll: pollItem() })));
    render();
    fireEvent.press(screen.getByLabelText("Saturday"));
    fireEvent.press(screen.getByRole("button", { name: "Vote" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The poll changed. Have another look."));
    expect(screen.getByLabelText("Saturday").props.accessibilityState).toMatchObject({ checked: false });
  });

  it("any other failure shows an inline error with Try again", async () => {
    api.put.mockRejectedValueOnce(conflict("poll_closed", "This poll is closed."));
    render();
    fireEvent.press(screen.getByLabelText("Saturday"));
    fireEvent.press(screen.getByRole("button", { name: "Vote" }));
    expect(await screen.findByText("This poll is closed.")).toBeTruthy();
    api.put.mockReturnValue(ok(detailItem(7, { poll: pollItem({ myOptionIds: [1] }) })));
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
  });
});

describe("PollCard retry after a failed vote", () => {
  const serverError = () =>
    new AxiosError("500", "ERR_BAD_RESPONSE", undefined, undefined, {
      status: 500,
      data: { error: { code: "internal_error", message: "Something went wrong" } },
    } as AxiosResponse);

  it("changing the pick clears the error, and Vote sends the new pick", async () => {
    api.put.mockRejectedValueOnce(serverError());
    render();
    fireEvent.press(screen.getByLabelText("Saturday"));
    fireEvent.press(screen.getByRole("button", { name: "Vote" }));
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Sunday"));
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    api.put.mockReturnValue(ok(detailItem(7, { poll: pollItem({ myOptionIds: [2] }) })));
    fireEvent.press(screen.getByRole("button", { name: "Vote" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put).toHaveBeenLastCalledWith("/api/v1/announcements/7/poll/vote", { version: 1, optionIds: [2] });
  });

  it("Try again sends the picks on screen at the time it is pressed", async () => {
    api.put.mockRejectedValueOnce(serverError());
    render({ allowsMultiple: true });
    fireEvent.press(screen.getByLabelText("Saturday"));
    fireEvent.press(screen.getByRole("button", { name: "Vote" }));
    fireEvent.press(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put).toHaveBeenLastCalledWith("/api/v1/announcements/7/poll/vote", { version: 1, optionIds: [1] });
  });
});

function opt(id: number, label: string, votes: number | null) {
  return { id, label, votes };
}
