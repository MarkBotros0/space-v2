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
  // Reset to the store's OWN initial state rather than to a literal. Two
  // wrong ways to write this, both of which make "starts idle" useless:
  // calling clear() sets "anonymous", so the assertion contradicts the
  // fixture; spelling out `{ status: "idle", ... }` sets the very value the
  // assertion checks, so it passes even if the store's initial status is
  // wrong. getInitialState() asserts nothing of its own, so the idle
  // cold-start value stays genuinely pinned by the first case below.
  useSessionStore.setState(useSessionStore.getInitialState(), true);
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
