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
 * Only the sessions domain exists so far — this file grows one small factory
 * per domain as more screens are wired up, not one shared mega-object.
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
  },
} as const;
