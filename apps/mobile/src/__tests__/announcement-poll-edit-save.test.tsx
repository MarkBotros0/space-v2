import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AxiosError } from "axios";
import type { AnnouncementPoll } from "@space/shared";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: "7" }),
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";
import { detailItem, ok, pollItem } from "./helpers/announcements";
import { PostForm } from "../screens/announcements/post-form";
import EditAnnouncementScreen from "../../app/(app)/announcements/[id]/edit";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const poll = (over: Partial<AnnouncementPoll> = {}): AnnouncementPoll =>
  pollItem({
    canManage: true,
    canSeeNames: true,
    voterCount: 4,
    multiPickVoters: 0,
    multiPickVotes: 0,
    options: [
      { id: 1, label: "Saturday", votes: 3 },
      { id: 2, label: "Sunday", votes: 1 },
    ],
    ...over,
  }) as AnnouncementPoll;

const lost = (votes: number) =>
  new AxiosError("conflict", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 409,
    data: { error: { code: "poll_votes_lost", message: "x" }, votes },
  } as never);

const open = (p: AnnouncementPoll | null) => {
  get.mockReturnValue(ok(detailItem(7, { canEdit: true, body: "Old body", poll: p })));
  renderWithProviders(<EditAnnouncementScreen />);
};

beforeEach(() => jest.clearAllMocks());

/** renderWithProviders' tree with one client, so a rerender keeps the providers. */
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = (ui: ReactElement) => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

describe("what an edit sends", () => {
  it("a message-only edit sends { body } with no poll key, even when the post has a poll", async () => {
    patch.mockResolvedValue(ok(detailItem(7)));
    open(poll());
    fireEvent.changeText(await screen.findByLabelText("Message"), "New body");
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toEqual({ body: "New body" });
  });

  it("changing an option label sends the poll", async () => {
    patch.mockResolvedValue(ok(detailItem(7)));
    open(poll({ options: [{ id: 1, label: "Saturday", votes: 0 }, { id: 2, label: "Sunday", votes: 0 }] }));
    fireEvent.changeText(await screen.findByLabelText("Option 1"), "Sat");
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toEqual({
      body: "Old body",
      poll: { allowsMultiple: false, options: [{ id: 1, label: "Sat" }, { id: 2, label: "Sunday" }] },
    });
  });

  it("removing the poll sends poll: null", async () => {
    patch.mockResolvedValue(ok(detailItem(7)));
    open(poll({ options: [{ id: 1, label: "Saturday", votes: 0 }, { id: 2, label: "Sunday", votes: 0 }] }));
    fireEvent.press(await screen.findByText("Remove poll"));
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toEqual({ body: "Old body", poll: null });
  });
});

describe("several to one with multi-pickers", () => {
  it("a 409 with the same vote-row count resends at once, with no New votes words", async () => {
    patch.mockRejectedValueOnce(lost(5));
    patch.mockResolvedValueOnce(ok(detailItem(7)));
    open(poll({ allowsMultiple: true, multiPickVoters: 2, multiPickVotes: 5 }));
    fireEvent.press(await screen.findByLabelText("Let people pick more than one"));
    fireEvent.press(screen.getByText("Save"));
    expect(
      await screen.findByText("2 people who picked more than one answer will need to vote again"),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[0][1].confirmVoteLoss).toBeUndefined();
    expect(patch.mock.calls[1][1].confirmVoteLoss).toBe(true);
    expect(screen.queryByText(/New votes came in/)).toBeNull();
  });
});

describe("a confirmed loss that failed for another reason", () => {
  it("is forgotten: a later 409 with the same count asks instead of resending", async () => {
    const onSubmit = jest.fn();
    const form = (props: { currentPoll: AnnouncementPoll; error: string | null; lost: number | null }) => (
      <PostForm
        mode="edit"
        screenTitle="Edit announcement"
        saveLabel="Save"
        toLabel="Everyone"
        pending={false}
        error={props.error}
        initial={{
          body: "Old body",
          poll: { allowsMultiple: false, options: [{ id: 1, label: "Saturday" }, { id: 2, label: "Sunday" }] },
        }}
        currentPoll={props.currentPoll}
        serverLostVotes={props.lost}
        onSubmit={onSubmit}
      />
    );
    const view = render(wrap(form({ currentPoll: poll(), error: null, lost: null })));
    const rerender = (props: Parameters<typeof form>[0]) => view.rerender(wrap(form(props)));
    // Remove Sunday (1 vote) and confirm: the first save carries no flag.
    fireEvent.press(screen.getByLabelText("Add option"));
    fireEvent.changeText(screen.getByLabelText("Option 3"), "Monday");
    fireEvent.press(screen.getByLabelText("Remove option 2"));
    fireEvent.press(screen.getByText("Save"));
    fireEvent.press(await screen.findByText("Save changes"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // It fails with a 500.
    rerender({ currentPoll: poll(), error: "Couldn't save. Try again.", lost: null });
    // Sunday's voter has moved on, so the app sees nothing to lose and saves straight away...
    const moved = poll({ options: [{ id: 1, label: "Saturday", votes: 4 }, { id: 2, label: "Sunday", votes: 0 }] });
    rerender({ currentPoll: moved, error: null, lost: null });
    fireEvent.press(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    // ...and the server's 409 happens to say 1 vote, the old confirmed count: ask, never resend.
    rerender({ currentPoll: moved, error: null, lost: 1 });
    expect(await screen.findByText("New votes came in: this change now deletes 1 vote.")).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

describe("a refetch while the edit screen is open", () => {
  it("a message-only save sends no poll and opens no vote-loss sheet, though initial.poll changed", async () => {
    const onSubmit = jest.fn();
    const form = (initialPoll: { allowsMultiple: boolean; options: { id: number; label: string }[] }, current: AnnouncementPoll) => (
      <PostForm
        mode="edit"
        screenTitle="Edit announcement"
        saveLabel="Save"
        toLabel="Everyone"
        pending={false}
        error={null}
        initial={{ body: "Old body", poll: initialPoll }}
        currentPoll={current}
        serverLostVotes={null}
        onSubmit={onSubmit}
      />
    );
    const opened = { allowsMultiple: false, options: [{ id: 1, label: "Saturday" }, { id: 2, label: "Sunday" }] };
    const view = render(wrap(form(opened, poll())));
    // Another manager renames Sunday and drops it to zero votes; a refetch lands.
    const theirs = { allowsMultiple: false, options: [{ id: 1, label: "Saturday" }, { id: 2, label: "Sun" }] };
    view.rerender(
      wrap(form(theirs, poll({ options: [{ id: 1, label: "Saturday", votes: 3 }, { id: 2, label: "Sun", votes: 0 }] }))),
    );
    fireEvent.changeText(screen.getByLabelText("Message"), "New body");
    fireEvent.press(screen.getByText("Save"));
    expect(screen.queryByText("Save changes")).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({ body: "New body" });
  });
});
