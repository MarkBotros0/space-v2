import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AxiosError } from "axios";
import type { AnnouncementPoll } from "@space/shared";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ id: "7" }),
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";
import { detailItem, ok, pollItem } from "./helpers/announcements";
import { editWarnings } from "../screens/announcements/poll/edit-warnings";
import EditAnnouncementScreen from "../../app/(app)/announcements/[id]/edit";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const poll = (over: Partial<AnnouncementPoll> = {}): AnnouncementPoll =>
  pollItem({
    canManage: true,
    voterCount: 5,
    multiPickVoters: 0,
    options: [
      { id: 1, label: "Saturday", votes: 3 },
      { id: 2, label: "Sunday", votes: 1 },
    ],
    ...over,
  }) as AnnouncementPoll;

describe("editWarnings", () => {
  it("has nothing to say when nothing with votes changes", () => {
    const next = { allowsMultiple: false, options: [{ id: 1, label: "Saturday" }, { id: 2, label: "Sunday" }, { label: "Monday" }] };
    expect(editWarnings(poll(), next)).toEqual({ lines: [], losesVotes: false });
    expect(editWarnings(null, next)).toEqual({ lines: [], losesVotes: false });
  });

  it("a rename warns but loses nothing (plural and singular)", () => {
    const r = editWarnings(poll(), {
      allowsMultiple: false,
      options: [{ id: 1, label: "Sat" }, { id: 2, label: "Sun" }],
    });
    expect(r.lines).toEqual([
      "Votes stay with the new wording: ‘Saturday’ → ‘Sat’ (3 votes)",
      "Votes stay with the new wording: ‘Sunday’ → ‘Sun’ (1 vote)",
    ]);
    expect(r.losesVotes).toBe(false);
  });

  it("a removed option deletes its votes", () => {
    const r = editWarnings(poll(), { allowsMultiple: false, options: [{ id: 1, label: "Saturday" }, { label: "Other" }] });
    expect(r.lines).toEqual(["Removing ‘Sunday’ deletes its 1 vote"]);
    expect(r.losesVotes).toBe(true);
  });

  it("several to one asks multi-pickers to vote again", () => {
    const keep = [{ id: 1, label: "Saturday" }, { id: 2, label: "Sunday" }];
    const p = poll({ allowsMultiple: true, multiPickVoters: 2 });
    expect(editWarnings(p, { allowsMultiple: false, options: keep })).toEqual({
      lines: ["2 people who picked more than one answer will need to vote again"],
      losesVotes: true,
    });
    expect(editWarnings(poll({ allowsMultiple: true, multiPickVoters: 1 }), { allowsMultiple: false, options: keep }).lines).toEqual([
      "1 person who picked more than one answer will need to vote again",
    ]);
    expect(editWarnings(poll({ allowsMultiple: true, multiPickVoters: 0 }), { allowsMultiple: false, options: keep }).lines).toEqual([]);
  });

  it("removing the poll deletes all its votes", () => {
    expect(editWarnings(poll(), null)).toEqual({ lines: ["Removes the poll and its 4 votes"], losesVotes: true });
    const one = poll({ options: [{ id: 1, label: "A", votes: 1 }, { id: 2, label: "B", votes: 0 }] });
    expect(editWarnings(one, null).lines).toEqual(["Removes the poll and its 1 vote"]);
    expect(editWarnings(pollItem() as AnnouncementPoll, null).lines).toEqual([]);
  });
});

describe("Edit screen with votes in", () => {
  beforeEach(() => jest.clearAllMocks());
  const open = () => {
    get.mockReturnValue(ok(detailItem(7, { canEdit: true, poll: poll() })));
    renderWithProviders(<EditAnnouncementScreen />);
  };

  it("saves straight away when nothing with votes changes", async () => {
    patch.mockResolvedValue(ok(detailItem(7)));
    open();
    fireEvent.press(await screen.findByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0][1].confirmVoteLoss).toBeUndefined();
  });

  it("a rename opens the sheet and saves without confirmVoteLoss", async () => {
    patch.mockResolvedValue(ok(detailItem(7)));
    open();
    fireEvent.changeText(await screen.findByLabelText("Option 1"), "Sat");
    fireEvent.press(screen.getByText("Save"));
    expect(await screen.findByText("Votes stay with the new wording: ‘Saturday’ → ‘Sat’ (3 votes)")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0][1].confirmVoteLoss).toBeUndefined();
  });

  it("a 409 poll_votes_lost swaps the same sheet's words and the confirm resends with confirmVoteLoss", async () => {
    patch.mockRejectedValueOnce(
      new AxiosError("conflict", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        data: { error: { code: "poll_votes_lost", message: "x" }, votes: 9 },
      } as never),
    );
    patch.mockResolvedValueOnce(ok(detailItem(7)));
    open();
    fireEvent.changeText(await screen.findByLabelText("Option 1"), "Sat");
    fireEvent.press(screen.getByText("Save"));
    fireEvent.press(screen.getByText("Save changes"));
    expect(await screen.findByText("New votes came in: this change now deletes 9 votes.")).toBeTruthy();
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1][1].confirmVoteLoss).toBe(true);
  });
});
