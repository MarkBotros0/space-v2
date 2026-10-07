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
  notes: {
    all: ["notes"] as const,
    lists: () => [...queryKeys.notes.all, "list"] as const,
    authored: () => [...queryKeys.notes.lists(), "authored"] as const,
    // Nullable per this file's header convention — no -1 sentinel.
    byStudent: (studentId: number | null) => [...queryKeys.notes.lists(), { studentId }] as const,
  },
  engagement: {
    all: ["engagement"] as const,
    // Nullable per this file's header convention — no -1 sentinel.
    student: (studentId: number | null) => [...queryKeys.engagement.all, "student", { studentId }] as const,
    season: (seasonId: number | null) => [...queryKeys.engagement.all, "season", { seasonId }] as const,
  },
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
  notifications: {
    all: ["notifications"] as const,
    lists: () => [...queryKeys.notifications.all, "list"] as const,
    // The unread-only inbox is a different server query, so it gets its own
    // cache entry rather than being filtered out of the full one.
    list: (unreadOnly: boolean) => [...queryKeys.notifications.lists(), { unreadOnly }] as const,
    unreadCount: () => [...queryKeys.notifications.all, "unread-count"] as const,
    preferences: () => [...queryKeys.notifications.all, "preferences"] as const,
  },
  users: {
    all: ["users"] as const,
    lists: () => [...queryKeys.users.all, "list"] as const,
    list: (filters: { q: string }) => [...queryKeys.users.lists(), filters] as const,
    details: () => [...queryKeys.users.all, "detail"] as const,
    // Nullable, per this file's header convention (a null key never collides
    // with a real id) — not a -1 sentinel.
    detail: (id: number | null) => [...queryKeys.users.details(), { id }] as const,
    /** GET /users/invites/pending — under `users.all`, so every users mutation refreshes it. */
    pendingInvites: () => [...queryKeys.users.all, "pending-invites"] as const,
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
  /**
   * The caller's own resources (/api/v1/me/*). Keys that the server resolves
   * from the token's activeSeasonId carry it, so a refreshed token pointing at
   * another season never serves the old season's cache.
   */
  me: {
    all: ["me"] as const,
    seasonHistory: (activeSeasonId: number | null) =>
      [...queryKeys.me.all, "season-history", { activeSeasonId }] as const,
    season: (seasonId: number | null) => [...queryKeys.me.all, "season", { seasonId }] as const,
    attendance: (seasonId: number | null) => [...queryKeys.me.all, "attendance", { seasonId }] as const,
    profile: () => [...queryKeys.me.all, "profile"] as const,
  },
  videoQuiz: {
    all: ["video-quiz"] as const,
    forSession: (sessionId: number) => [...queryKeys.videoQuiz.all, "student", sessionId] as const,
    questions: (sessionId: number) => [...queryKeys.videoQuiz.all, "admin", sessionId] as const,
    results: (sessionId: number) => [...queryKeys.videoQuiz.all, "results", sessionId] as const,
  },
  forum: {
    all: ["forum"] as const,
    thread: (assignmentId: number) => [...queryKeys.forum.all, "thread", assignmentId] as const,
    comments: (assignmentId: number, postPublicId: string) =>
      [...queryKeys.forum.all, "comments", assignmentId, postPublicId] as const,
  },
  events: {
    all: ["events"] as const,
    list: () => [...queryKeys.events.all, "list"] as const,
    // Plan 16's UpcomingEventsCard (spec 19 §7). Under `all`, so every event
    // write's prefix invalidation refreshes the dashboards too.
    upcoming: (limit: number) => [...queryKeys.events.all, "upcoming", limit] as const,
    detail: (id: number) => [...queryKeys.events.all, "detail", id] as const,
  },
} as const;
