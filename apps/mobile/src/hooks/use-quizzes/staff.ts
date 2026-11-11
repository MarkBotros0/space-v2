import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  quizAuthoringDetailSchema,
  quizListPageSchema,
  quizLiveSchema,
  type QuizAuthoringDetail,
  type QuizListPage,
  type QuizLive,
} from "@space/shared";

import { apiClient } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";
import { apiGet } from "../../lib/api-request";

/** The API's largest staff-list page (quizListQuerySchema caps `limit` at 100). */
const QUIZ_LIST_PAGE = 100;
/** A runaway-cursor backstop: 50 pages of 100 is far past any real season. */
const QUIZ_LIST_MAX_PAGES = 50;

/**
 * Staff list — EVERY page, following nextCursor. Parses the staff arm
 * specifically — see the student hook below.
 *
 * The server pages by id while the screens sort by session date (v1's order),
 * and v1 showed the whole season. A "Load more" over id-ordered pages would
 * reshuffle rows the reader already saw, so the hook walks the cursor and
 * returns one page holding everything, with `nextCursor: null`.
 */
export function useQuizList(seasonId: number | null): UseQueryResult<QuizListPage> {
  return useQuery({
    queryKey: queryKeys.quizzes.staffBySeason(seasonId),
    queryFn: async () => {
      const items: QuizListPage["items"] = [];
      let cursor: number | null = null;
      for (let i = 0; i < QUIZ_LIST_MAX_PAGES; i++) {
        const after: string = cursor === null ? "" : `&cursor=${cursor}`;
        const res = await apiClient.get(`/api/v1/quizzes?seasonId=${seasonId}&limit=${QUIZ_LIST_PAGE}${after}`);
        const page = quizListPageSchema.parse(res.data.data);
        items.push(...page.items);
        cursor = page.nextCursor;
        if (cursor === null) break;
      }
      return { items, nextCursor: null };
    },
    enabled: seasonId !== null,
  });
}

/**
 * Staff detail — the authoring/grading shape, WITH the answer key.
 *
 * A separate hook from useStudentQuizDetail even though the URL is the same,
 * because the schemas are different types and the role decides which one the
 * server sends. Never call both from one screen.
 */
export function useQuizAuthoringDetail(id: number | null, enabled: boolean): UseQueryResult<QuizAuthoringDetail> {
  return useQuery({
    queryKey: queryKeys.quizzes.staffDetail(id),
    queryFn: () => apiGet(`/api/v1/quizzes/${id}`, quizAuthoringDetailSchema),
    enabled: enabled && id !== null,
  });
}

/** How often the live screen re-reads while it is in front (spec "Live screen": polling). */
export const QUIZ_LIVE_POLL_MS = 4000;

/**
 * The staff live screen: every student in scope, where they are now. Polls every 4 s only while
 * `polling` (the screen is focused and the app in the foreground); the caller decides that, so a
 * screen left open under another or a phone in a pocket never polls.
 */
export function useQuizLive(id: number | null, polling: boolean): UseQueryResult<QuizLive> {
  return useQuery({
    queryKey: queryKeys.quizzes.live(id),
    queryFn: () => apiGet(`/api/v1/quizzes/${id}/live`, quizLiveSchema),
    enabled: id !== null,
    refetchInterval: polling ? QUIZ_LIVE_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}
