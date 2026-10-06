import type { RecurrenceScope } from "@space/shared";

/**
 * Query-key convention for React Query.
 *
 * Each domain gets a small factory of its own, built the same way: a root
 * tuple identifying the domain, a `lists()` tuple for "some collection of
 * this domain" queries, and leaf functions that append the specific filter
 * (e.g. a season id) used for that particular fetch. Spreading the parent at
 * each level (rather than writing out flat arrays) is what makes the
 * hierarchy actually mean something to React Query's cache: `invalidateQueries`
 * matches by prefix, so invalidating `sessions.all` catches every session
 * query regardless of which season it was scoped to, `sessions.lists()`
 * catches every list variant, and `sessions.bySeason(id)` targets just one
 * season's list without touching any other season's cached data.
 *
 * `as const` on every tuple keeps the key's literal shape (not widened to
 * `(string | number)[]`) so a caller can't accidentally invalidate a broader
 * subtree than intended by passing a mistyped key.
 *
 * One small factory per domain, added as screens are wired up.
 */
export const queryKeys = {
  sessions: {
    all: ["sessions"] as const,
    lists: () => [...queryKeys.sessions.all, "list"] as const,
    // `seasonId` is nullable because its one caller (`useSeasonSessions`)
    // is a dependent query keyed on `scopes.activeSeasonId`, which is itself
    // nullable — see the note there. Accepting `null` here (rather than a
    // sentinel like `-1`) keeps the cache key honest about that: a `null`
    // key can never collide with a real season's cached list.
    bySeason: (seasonId: number | null) => [...queryKeys.sessions.lists(), { seasonId }] as const,
    detail: (id: number | null) => [...queryKeys.sessions.all, "detail", { id }] as const,
    /** GET /sessions windows (D-16.7). Under lists(), so invalidating sessions.all refreshes them. */
    range: (params: { seasonId: number | null; from: string | null; to: string | null }) =>
      [...queryKeys.sessions.lists(), "range", params] as const,
    series: (id: number | null, scope: RecurrenceScope) =>
      [...queryKeys.sessions.all, "series", { id, scope }] as const,
    checkIn: (id: number | null) => [...queryKeys.sessions.all, "checkIn", { id }] as const,
    quizzes: (id: number | null) => [...queryKeys.sessions.all, "quizzes", { id }] as const,
  },
  students: {
    all: ["students"] as const,
    lists: () => [...queryKeys.students.all, "list"] as const,
    list: (status: string, q: string) => [...queryKeys.students.lists(), { status, q }] as const,
    details: () => [...queryKeys.students.all, "detail"] as const,
    // number | null, like sessions.bySeason: a null key can never collide
    // with a real student's cached detail (no -1 sentinel).
    detail: (id: number | null) => [...queryKeys.students.details(), { id }] as const,
  },
  seasons: {
    all: ["seasons"] as const,
    list: () => [...queryKeys.seasons.all, "list"] as const,
    detail: (id: number | null) => [...queryKeys.seasons.all, "detail", { id }] as const,
    byCode: (code: string | null) => [...queryKeys.seasons.all, "byCode", { code }] as const,
  },
  assignments: {
    all: ["assignments"] as const,
    lists: () => [...queryKeys.assignments.all, "list"] as const,
    bySeason: (seasonId: number | null) =>
      [...queryKeys.assignments.lists(), { seasonId }] as const,
    details: () => [...queryKeys.assignments.all, "detail"] as const,
    detail: (id: number | null) => [...queryKeys.assignments.details(), id] as const,
    // The staff arm of the same endpoint, keyed apart from the student arm so
    // one role's cached shape can never be served to the other's parser.
    staffBySeason: (seasonId: number | null) =>
      [...queryKeys.assignments.lists(), "staff", { seasonId }] as const,
    trackers: () => [...queryKeys.assignments.all, "tracker"] as const,
    tracker: (id: number | null) => [...queryKeys.assignments.trackers(), id] as const,
  },
  submissions: {
    all: ["submissions"] as const,
    details: () => [...queryKeys.submissions.all, "detail"] as const,
    detail: (publicId: string | null) => [...queryKeys.submissions.details(), publicId] as const,
    queues: () => [...queryKeys.submissions.all, "queue"] as const,
    queue: (filters: { pendingOnly: boolean; seasonId?: number }) =>
      [...queryKeys.submissions.queues(), filters] as const,
  },
  groups: {
    all: ["groups"] as const,
    mine: () => [...queryKeys.groups.all, "mine"] as const,
    detail: (id: number | null) => [...queryKeys.groups.all, "detail", id] as const,
    bySeason: (seasonId: number | null) => [...queryKeys.groups.all, "season", { seasonId }] as const,
    impact: (id: number | null) => [...queryKeys.groups.all, "impact", { id }] as const,
    leaderOptions: () => [...queryKeys.groups.all, "leaderOptions"] as const,
    /**
     * Under groups.all ON PURPOSE: every group write (create, edit, delete,
     * bulk assign) can change any roster row — GroupStudent is globally unique
     * (spec 05 R3) — so they all invalidate groups.all and this goes with it.
     */
    roster: (seasonId: number | null) => [...queryKeys.groups.all, "roster", { seasonId }] as const,
  },
  attendance: {
    all: ["attendance"] as const,
    roster: (sessionId: number | null) => [...queryKeys.attendance.all, "roster", sessionId] as const,
  },
  quizzes: {
    all: ["quizzes"] as const,
    lists: () => [...queryKeys.quizzes.all, "list"] as const,
    bySeason: (seasonId: number | null) => [...queryKeys.quizzes.lists(), { seasonId }] as const,
    details: () => [...queryKeys.quizzes.all, "detail"] as const,
    // number | null, like sessions.bySeason: a null key never collides with a
    // real quiz's cache entry, so no -1 sentinel anywhere.
    detail: (id: number | null) => [...queryKeys.quizzes.details(), { id }] as const,
    attempts: (id: number | null) => [...queryKeys.quizzes.detail(id), "attempts"] as const,
    grades: (id: number | null) => [...queryKeys.quizzes.detail(id), "grades"] as const,
  },
} as const;
