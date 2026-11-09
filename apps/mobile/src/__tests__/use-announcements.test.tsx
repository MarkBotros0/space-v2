import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import {
  useAnnouncement,
  useAnnouncementFeed,
  useAnnouncementTargets,
  useAnnouncementUnread,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useClosePoll,
  useMarkAnnouncementRead,
  usePollVoters,
  useReopenPoll,
  useUpdateAnnouncement,
  useVotePoll,
} from "../hooks/use-announcements";
import { apiClient } from "../lib/api-client";
import { pollVotesLost } from "../lib/api-error";
import { queryKeys } from "../lib/query-keys";

const api = apiClient as unknown as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const item = (id: number) => ({
  id,
  audience: "COMMUNITY",
  seasonId: null,
  seasonTitle: null,
  excerpt: "Hello",
  authorName: "Sam",
  createdAt: "2026-11-07T10:00:00.000Z",
  editedAt: null,
  isRead: false,
  hasPoll: false,
  pollClosed: null,
});
const detail = (id: number) => {
  const { excerpt: _e, ...rest } = item(id);
  return { ...rest, body: "Full body", canEdit: false, canDelete: false, seasonFinished: false, poll: null };
};

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("useAnnouncementFeed", () => {
  it("parses a page and requests the next one by cursor", async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: { items: [item(2)], nextCursor: "c1" } } })
      .mockResolvedValueOnce({ data: { data: { items: [item(1)], nextCursor: null } } });
    const { result } = renderHook(() => useAnnouncementFeed(), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(api.get).toHaveBeenLastCalledWith("/api/v1/announcements");
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(api.get).toHaveBeenLastCalledWith("/api/v1/announcements?cursor=c1");
    // Under load the second page can land a render after fetchNextPage resolves.
    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((p) => p.items.map((i) => i.id))).toEqual([2, 1]),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it("throws on schema drift instead of handing back a malformed row", async () => {
    api.get.mockResolvedValue({
      data: { data: { items: [{ ...item(1), isRead: "no" }], nextCursor: null } },
    });
    const { result } = renderHook(() => useAnnouncementFeed(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useAnnouncementUnread and targets", () => {
  it("parses the unread summary", async () => {
    api.get.mockResolvedValue({ data: { data: { count: 3, latest: item(9) } } });
    const { result } = renderHook(() => useAnnouncementUnread(), { wrapper });
    await waitFor(() => expect(result.current.data?.count).toBe(3));
    expect(api.get).toHaveBeenCalledWith("/api/v1/announcements/unread");
  });

  it("does not fetch targets until enabled", async () => {
    const { result } = renderHook(() => useAnnouncementTargets(false), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("useAnnouncement", () => {
  it("does not fetch for a null id", () => {
    const { result } = renderHook(() => useAnnouncement(null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("returns the parsed detail", async () => {
    api.get.mockResolvedValue({ data: { data: detail(7) } });
    const { result } = renderHook(() => useAnnouncement(7), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject({ id: 7, body: "Full body" }));
    expect(api.get).toHaveBeenCalledWith("/api/v1/announcements/7");
  });

  it("maps a 404 not_found to { removed: true }", async () => {
    const err = new AxiosError("nope", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 404,
      data: { error: { code: "not_found", message: "Not found" } },
    } as AxiosResponse);
    api.get.mockRejectedValue(err);
    const { result } = renderHook(() => useAnnouncement(7), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ removed: true }));
    expect(result.current.isError).toBe(false);
  });

  it("still surfaces other failures as errors", async () => {
    api.get.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useAnnouncement(7), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

/** What the table below needs of a mutation: each hook takes its own variables, so the call casts them. */
type Mut = { mutateAsync: (variables: never) => Promise<unknown> };

describe("mutations invalidate announcements.all", () => {
  it.each([
    ["mark read", () => useMarkAnnouncementRead(), (m: Mut) => m.mutateAsync(5 as never), "post", {}],
    [
      "create",
      () => useCreateAnnouncement(),
      (m: Mut) => m.mutateAsync({ audience: "COMMUNITY", body: "B" } as never),
      "post",
      { data: { data: detail(5) } },
    ],
    [
      "update",
      () => useUpdateAnnouncement(5),
      (m: Mut) => m.mutateAsync({ body: "B2" } as never),
      "patch",
      { data: { data: detail(5) } },
    ],
    ["delete", () => useDeleteAnnouncement(), (m: Mut) => m.mutateAsync(5 as never), "delete", { status: 204 }],
  ] as const)("%s", async (_n, hook, run, verb, response) => {
    api[verb].mockResolvedValue(response);
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => hook(), { wrapper });
    await act(async () => {
      await run(result.current);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.announcements.all });
  });

  it("targets the right URLs", async () => {
    api.post.mockResolvedValue({ status: 204 });
    const { result } = renderHook(() => useMarkAnnouncementRead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(5);
    });
    expect(api.post).toHaveBeenCalledWith("/api/v1/announcements/5/read");
  });

  it("delete removes the post's own detail query before invalidating", async () => {
    api.delete.mockResolvedValue({ status: 204 });
    client.setQueryData(queryKeys.announcements.detail(5), detail(5));
    const order: string[] = [];
    jest.spyOn(client, "removeQueries").mockImplementation(() => void order.push("remove"));
    jest.spyOn(client, "invalidateQueries").mockImplementation(() => {
      order.push("invalidate");
      return Promise.resolve();
    });
    const { result } = renderHook(() => useDeleteAnnouncement(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(5);
    });
    expect(order).toEqual(["remove", "invalidate"]);
    expect(client.removeQueries).toHaveBeenCalledWith({ queryKey: queryKeys.announcements.detail(5) });
  });
});

const conflict = (code: string, extra: object = {}) =>
  new AxiosError("conflict", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 409,
    data: { error: { code, message: "Conflict" }, ...extra },
  } as AxiosResponse);

describe("poll hooks", () => {
  it("a vote writes the returned detail into the cache and invalidates the feed", async () => {
    const voted = { ...detail(5), body: "Voted" };
    api.put.mockResolvedValue({ data: { data: voted } });
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useVotePoll(5), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ version: 2, optionIds: [3] });
    });
    expect(api.put).toHaveBeenCalledWith("/api/v1/announcements/5/poll/vote", {
      version: 2,
      optionIds: [3],
    });
    expect(client.getQueryData(queryKeys.announcements.detail(5))).toMatchObject({ body: "Voted" });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.announcements.feed() });
  });

  it("a poll_changed 409 invalidates the detail", async () => {
    api.put.mockRejectedValue(conflict("poll_changed"));
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useVotePoll(5), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ version: 1, optionIds: [3] }).catch(() => undefined);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.announcements.detail(5) });
  });

  it.each([
    ["close", () => useClosePoll(5), "/api/v1/announcements/5/poll/close"],
    ["reopen", () => useReopenPoll(5), "/api/v1/announcements/5/poll/reopen"],
  ] as const)("%s posts and writes the detail", async (_n, hook, url) => {
    api.post.mockResolvedValue({ data: { data: { ...detail(5), body: "After" } } });
    const { result } = renderHook(() => hook(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(api.post).toHaveBeenCalledWith(url);
    expect(client.getQueryData(queryKeys.announcements.detail(5))).toMatchObject({ body: "After" });
  });

  it.each([
    ["vote", () => useVotePoll(5), "put", { version: 1, optionIds: [3] }],
    ["close", () => useClosePoll(5), "post", undefined],
    ["reopen", () => useReopenPoll(5), "post", undefined],
  ] as const)("a %s invalidates the voters list, so the sheet never shows stale names", async (_n, hook, verb, body) => {
    api[verb].mockResolvedValue({ data: { data: detail(5) } });
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => hook(), { wrapper });
    await act(async () => {
      await (result.current.mutateAsync as (b?: unknown) => Promise<unknown>)(body);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.announcements.voters(5) });
  });

  it("pollVotesLost reads votes off a 409 poll_votes_lost, else null", () => {
    expect(pollVotesLost(conflict("poll_votes_lost", { votes: 7 }))).toBe(7);
    expect(pollVotesLost(conflict("poll_changed"))).toBeNull();
    expect(pollVotesLost(conflict("poll_votes_lost"))).toBeNull();
    expect(pollVotesLost(new Error("x"))).toBeNull();
  });

  it("voters are parsed, and not fetched while disabled", async () => {
    const off = renderHook(() => usePollVoters(5, false), { wrapper });
    expect(off.result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
    api.get.mockResolvedValue({
      data: { data: { options: [{ id: 3, label: "A", voters: [{ name: "Sam" }, { name: null }] }] } },
    });
    const { result } = renderHook(() => usePollVoters(5, true), { wrapper });
    await waitFor(() => expect(result.current.data?.options[0]?.voters).toHaveLength(2));
    expect(api.get).toHaveBeenCalledWith("/api/v1/announcements/5/poll/voters");
  });

  it("update passes poll and confirmVoteLoss through", async () => {
    api.patch.mockResolvedValue({ data: { data: detail(5) } });
    const body = {
      body: "B",
      poll: { options: [{ label: "A" }, { label: "B" }], multiSelect: false },
      confirmVoteLoss: true,
    };
    const { result } = renderHook(() => useUpdateAnnouncement(5), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(body as never);
    });
    expect(api.patch).toHaveBeenCalledWith("/api/v1/announcements/5", body);
  });
});
