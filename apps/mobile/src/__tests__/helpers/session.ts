import type { MeScopes, MeUser, UserRole } from "@space/shared";

/**
 * Typed session fixtures. `MeUser` requires `avatarPath`, and test files are
 * typechecked (tsconfig includes src/**), so a hand-written
 * `{ id, name, email, role }` literal turns `pnpm turbo typecheck` red.
 * Every mobile test builds its session here instead (ruling X11).
 */
export function makeUser(role: UserRole, overrides: Partial<MeUser> = {}): MeUser {
  return {
    id: 1,
    name: `Test ${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@jpc.test`,
    role,
    avatarPath: null,
    ...overrides,
  };
}

export function makeScopes(overrides: Partial<MeScopes> = {}): MeScopes {
  return {
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null,
    ...overrides,
  };
}

/** Spread straight into `useSessionStore.setState(...)`. */
export function makeSession(
  role: UserRole,
  scopes: Partial<MeScopes> = {},
  user: Partial<MeUser> = {},
): { user: MeUser; scopes: MeScopes; status: "authenticated" } {
  return { user: makeUser(role, user), scopes: makeScopes(scopes), status: "authenticated" };
}
