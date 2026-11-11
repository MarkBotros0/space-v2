import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react-native";

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
import { useDraftFlush, waitForDraftWrites } from "../screens/assignment-detail/use-draft-flush";
import { assignmentDetail, essayWork, forumWork, videoWork } from "./helpers/assignment-fixtures";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

/*
 * Review M2: leaving the essay screen flushes a changed draft without waiting.
 * Submit must wait for that write, or it can hand in the older text and the
 * flush then fails on the locked essay.
 */

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

/** Leaves an essay editor with changed text: its flush starts and waits on `save`. */
async function leaveWithPendingFlush(publicId: string) {
  let land!: () => void;
  const save = jest.fn(() => new Promise<void>((resolve) => (land = resolve)));
  const { unmount } = renderHook(() =>
    useDraftFlush(publicId, save, { text: "newer words", serverText: "older words", editable: true }),
  );
  unmount();
  // The write is chained after any earlier one, so it starts a tick later.
  await act(async () => {
    await Promise.resolve();
  });
  expect(save).toHaveBeenCalledWith({ text: "newer words" });
  return () => act(() => land());
}

describe("waitForDraftWrites", () => {
  it("resolves at once with nothing in flight", async () => {
    await expect(waitForDraftWrites()).resolves.toBeUndefined();
  });

  it("waits for every pending draft write", async () => {
    const landA = await leaveWithPendingFlush("essayA");
    const landB = await leaveWithPendingFlush("essayB");
    let done = false;
    const waiting = waitForDraftWrites().then(() => {
      done = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(done).toBe(false);
    await landA();
    expect(done).toBe(false);
    await landB();
    await waiting;
    expect(done).toBe(true);
  });
});

describe("Submit after leaving an essay", () => {
  it("posts only once the draft flush has landed", async () => {
    get.mockResolvedValue({
      data: { data: assignmentDetail([videoWork(1000), essayWork("DRAFT", 200), forumWork(true)]) },
    });
    post.mockResolvedValue({ data: { data: { submittedAt: "2099-03-30T10:00:00.000Z", completedAt: null } } });
    const land = await leaveWithPendingFlush("essay00001");
    renderStacked(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "Submit" }));
    fireEvent.press(await screen.findByText("Yes, submit"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(post).not.toHaveBeenCalled();

    await land();
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/assignments/41/submit"));
  });
});
