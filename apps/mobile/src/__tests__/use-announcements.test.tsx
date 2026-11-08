import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import {
  useAnnouncement,
  useAnnouncementFeed,
  useAnnouncementTargets,
  useAnnouncementUnread,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useMarkAnnouncementRead,
  useUpdateAnnouncement,
} from "../hooks/use-announcements";
import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const api = apiClient as unknown as Record<"get" | "post" | "patch" | "delete", jest.Mock>;

const item = (id: number) => ({
  id,
  audience: "COMMUNITY",
  seasonId: null,
  seasonTitle: null,
  title: `Post ${id}`,
  excerpt: "Hello",
  authorName: "Sam",
  createdAt: "2026-11-07T10:00:00.000Z",
  editedAt: null,
  isRead: false,
});
const detail = (id: number) => {
  const { excerpt: _e, ...rest } = item(id);
  return { ...rest, body: "Full body", canEdit: false, canDelete: false, seasonFinished: false };
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

describe("mutations invalidate announcements.all", () => {
  it.each([
    ["mark read", () => useMarkAnnouncementRead(), (m: any) => m.mutateAsync(5), "post", {}],
    [
      "create",
      () => useCreateAnnouncement(),
      (m: any) => m.mutateAsync({ audience: "COMMUNITY", title: "T", body: "B" }),
      "post",
      { data: { data: detail(5) } },
    ],
    [
      "update",
      () => useUpdateAnnouncement(5),
      (m: any) => m.mutateAsync({ title: "T2" }),
      "patch",
      { data: { data: detail(5) } },
    ],
    ["delete", () => useDeleteAnnouncement(), (m: any) => m.mutateAsync(5), "delete", { status: 204 }],
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
});
