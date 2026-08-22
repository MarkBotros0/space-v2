import { navByRole } from "@space/shared";

import { useSessionStore } from "../store/session";

const user = { id: 1, name: "A", email: "a@b.test", role: "STUDENT" as const, avatarPath: null };
const scopes = {
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null as number | null,
};

beforeEach(() => {
  // Reset to the real initial state, not via clear() — clear() sets
  // "anonymous", and "starts idle" is precisely the case that must not be
  // pre-satisfied by the fixture.
  useSessionStore.setState({ status: "idle", user: null, scopes: null });
});

describe("session store", () => {
  it("starts idle with no user", () => {
    expect(useSessionStore.getState().status).toBe("idle");
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().scopes).toBeNull();
  });

  it("setSession stores both halves and marks authenticated", () => {
    useSessionStore.getState().setSession(user, scopes);
    const s = useSessionStore.getState();
    expect(s.user).toEqual(user);
    expect(s.scopes).toEqual(scopes);
    expect(s.status).toBe("authenticated");
  });

  it("clear resets to anonymous, not idle", () => {
    // idle means "not yet checked"; anonymous means "checked, nobody home".
    // Conflating them makes the boot gate loop or flash the login screen.
    useSessionStore.getState().setSession(user, scopes);
    useSessionStore.getState().clear();
    const s = useSessionStore.getState();
    expect(s.status).toBe("anonymous");
    expect(s.user).toBeNull();
    expect(s.scopes).toBeNull();
  });

  it("resolves the nav for the signed-in user", () => {
    useSessionStore.getState().setSession(user, scopes);
    expect(useSessionStore.getState().nav()).toBe(navByRole.STUDENT);
  });

  it("resolves the alumni nav for a graduated student", () => {
    useSessionStore.getState().setSession(user, { ...scopes, graduationYear: 2024 });
    const nav = useSessionStore.getState().nav();
    expect(nav?.tabs.map((t) => t.label)).toEqual(["Events", "History", "Home", "Profile", "More"]);
  });

  it("has no nav when anonymous", () => {
    expect(useSessionStore.getState().nav()).toBeNull();
  });
});
