import { useInfiniteQuery } from "@tanstack/react-query";
import {
  studentListResponseSchema,
  type StudentListResponse,
  type StudentListSort,
  type StudentListStatus,
} from "@space/shared";

import { queryKeys } from "../../lib/query-keys";
import { apiGet } from "../../lib/api-request";

/** The list's group filter and sort (REG-82); null leaves each to the server's default. */
export interface StudentListView {
  /** One season's people (a Super picks it first, then its groups). */
  seasonId: number | null;
  groupId: number | "none" | null;
  sort: StudentListSort | null;
  dir: "asc" | "desc";
  /** The mentor's "Absent lately": last two marked sessions both absent (owner, 2026-11-07). */
  absentLately: boolean;
}

export const DEFAULT_STUDENT_VIEW: StudentListView = {
  seasonId: null,
  groupId: null,
  sort: null,
  dir: "asc",
  absentLately: false,
};

async function fetchStudentsPage(
  status: StudentListStatus,
  q: string,
  view: StudentListView,
  cursor: number | null,
): Promise<StudentListResponse> {
  const params = new URLSearchParams({ status });
  if (q) params.set("q", q);
  if (view.seasonId !== null) params.set("seasonId", String(view.seasonId));
  if (view.groupId !== null) params.set("groupId", String(view.groupId));
  if (view.absentLately) params.set("absentLately", "1");
  if (view.sort !== null) {
    params.set("sort", view.sort);
    params.set("dir", view.dir);
  }
  if (cursor !== null) params.set("cursor", String(cursor));
  return apiGet(`/api/v1/students?${params.toString()}`, studentListResponseSchema);
}

/**
 * Cursor-paginated student list. `enabled` is the role gate: the endpoint
 * 403s roles outside each surface, and the screen knows its allowed roles up
 * front — asking anyway would render an error state where a calm "not for
 * your role" empty state belongs.
 */
export function useStudentList(
  status: StudentListStatus,
  q: string,
  enabled: boolean,
  view: StudentListView = DEFAULT_STUDENT_VIEW,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.students.list(status, q, view),
    queryFn: ({ pageParam }) => fetchStudentsPage(status, q, view, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}
