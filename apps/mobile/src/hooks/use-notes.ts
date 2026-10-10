import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import {
  authoredNoteListResponseSchema,
  noteListResponseSchema,
  noteSummarySchema,
  type NoteVisibility,
} from "@space/shared";
import type { z } from "zod";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export type AuthoredNotePage = z.infer<typeof authoredNoteListResponseSchema>;

/** `?cursor=` appended only past the first page, so page one's URL is bare. */
function withCursor(path: string, cursor: string | null): string {
  return cursor === null ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
}

/** Every page's rows, in order, for rendering. */
export function flattenNotePages<T>(pages: { notes: T[] }[] | undefined): T[] {
  return (pages ?? []).flatMap((p) => p.notes);
}

/**
 * The notes this caller wrote, across students — every page, not the first.
 *
 * `enabled` is passed by the screen rather than derived here, because the one
 * role that must NOT call this (STUDENT) gets a 403, not an empty list — the
 * API refuses students explicitly (spec D5 #2), and a query that fires only to
 * be refused would surface as an error state on a screen that should simply
 * say the surface is not theirs.
 */
export function useAuthoredNotes(
  enabled: boolean,
): UseInfiniteQueryResult<InfiniteData<AuthoredNotePage>> {
  return useInfiniteQuery({
    queryKey: queryKeys.notes.authored(),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.get(withCursor("/api/v1/me/notes", pageParam));
      return authoredNoteListResponseSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

export type NotePage = z.infer<typeof noteListResponseSchema>;

/** Every page of one student's notes, following nextCursor (R41). */
export function useStudentNotes(
  studentId: number | null,
  enabled: boolean,
): UseInfiniteQueryResult<InfiniteData<NotePage>> {
  return useInfiniteQuery({
    queryKey: queryKeys.notes.byStudent(studentId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.get(withCursor(`/api/v1/students/${studentId}/notes`, pageParam));
      return noteListResponseSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: enabled && studentId !== null,
  });
}

export function useCreateNote(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      body: string;
      visibility: NoteVisibility;
      followUpFlagged: boolean;
    }) => {
      const res = await apiClient.post(`/api/v1/students/${studentId}/notes`, input);
      return noteSummarySchema.parse(res.data.data.note);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes.byStudent(studentId) });
      // The author's own list gained a row too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes.authored() });
    },
  });
}
