import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));

import { useCreateNote, useVisibleNotes } from "../hooks/use-notes";
import { apiClient } from "../lib/api-client";

const get = apiClient.get as jest.Mock;

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  client ??= new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const note = {
  id: 1,
  body: "Checked in",
  visibility: "MENTORS",
  followUpFlagged: false,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  edited: false,
  authorId: 3,
  authorName: "Mentor",
  authorRole: "MENTOR",
  seasonId: null,
  seasonTitle: null,
  canEdit: true,
  student: { id: 9, name: "Sam", email: "sam@example.com" },
};

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("useVisibleNotes", () => {
  it("GETs the feed with the limit and returns the parsed notes", async () => {
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });
    const { result } = renderHook(() => useVisibleNotes(5, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/me/visible-notes?limit=5");
    expect(result.current.data).toEqual([note]);
  });

  it("rejects a row missing its student", async () => {
    const { student: _student, ...bare } = note;
    get.mockResolvedValue({ data: { data: { notes: [bare], nextCursor: null } } });
    const { result } = renderHook(() => useVisibleNotes(5, true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("does not fetch while disabled", () => {
    renderHook(() => useVisibleNotes(5, false), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it("refetches after a note is created, so Recent notes shows it", async () => {
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { data: { note: { ...note, id: 2 } } },
    });
    const { result } = renderHook(
      () => ({ feed: useVisibleNotes(5, true), create: useCreateNote(9) }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.feed.isSuccess).toBe(true));
    get.mockClear();
    await act(async () => {
      await result.current.create.mutateAsync({
        body: "New",
        visibility: "MENTORS",
        followUpFlagged: true,
      });
    });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/me/visible-notes?limit=5"));
  });
});
