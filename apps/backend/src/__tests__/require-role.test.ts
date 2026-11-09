import type { Request, Response } from "express";

import type { SessionUser } from "../lib/auth/tokens";
import { isSuper } from "../lib/rbac";
import { requireRole } from "../middleware/require-auth";

function fakeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

const user = (role: SessionUser["role"]) =>
  ({
    userId: 1,
    role,
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null,
  }) as SessionUser;

describe("requireRole", () => {
  it("returns the user when the predicate holds and sends nothing", () => {
    const res = fakeRes();
    const req = { user: user("SUPER") } as unknown as Request;
    expect(requireRole(req, res as unknown as Response, isSuper)).toBe(req.user);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("answers the generic 403 by default, or the route's own message", () => {
    const req = { user: user("ADMIN") } as unknown as Request;
    const plain = fakeRes();
    expect(requireRole(req, plain as unknown as Response, isSuper)).toBeNull();
    expect(plain.status).toHaveBeenCalledWith(403);
    expect(plain.json).toHaveBeenCalledWith({
      error: { code: "forbidden", message: "You don't have access to this." },
    });

    const own = fakeRes();
    requireRole(req, own as unknown as Response, isSuper, "Only a super admin can manage events.");
    expect(own.json).toHaveBeenCalledWith({
      error: { code: "forbidden", message: "Only a super admin can manage events." },
    });
  });

  it("throws the 401 when nobody is signed in, like requireUser", () => {
    expect(() => requireRole({} as Request, fakeRes() as unknown as Response, isSuper)).toThrow("Not authenticated.");
  });
});
