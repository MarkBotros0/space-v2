// GET /assignments/:id for a student, with the database mocked: the read gate
// needs an enrolment of any status; the token's season is not consulted.

const mockDb = {
  assignment: { findFirst: jest.fn() },
  seasonEnrollment: { findUnique: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
// requireAuth's Plan 18 M13 check reads User.sessionsValidFrom; no session
// has been invalidated in this suite.
jest.mock("../lib/auth/session-validity", () => ({ isAccessTokenInvalidated: async () => false }));
const mockLoad = jest.fn();
jest.mock("../lib/queries/assignments", () => ({
  ...jest.requireActual("../lib/queries/assignments"),
  loadAssignmentById: (...args: unknown[]) => mockLoad(...args),
}));

import express from "express";
import request from "supertest";

import { signAccessToken, type SessionUser } from "../lib/auth/tokens";
import { assignmentsRouter } from "../routes/assignments";

const app = express();
app.use("/api/v1/assignments", assignmentsRouter);

async function tokenFor(over: Partial<SessionUser>): Promise<string> {
  const { token } = await signAccessToken({
    userId: 10, role: "STUDENT", seasonAdminIds: [], groupLeaderIds: [],
    activeSeasonId: null, graduationYear: null, ...over,
  });
  return token;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.assignment.findFirst.mockResolvedValue({ seasonId: 7 });
  // Past the gate, the loader answering null gives a 404 — enough to prove the
  // gate let the caller through without building a whole assignment.
  mockLoad.mockResolvedValue(null);
});

async function get(token: string) {
  return request(app).get("/api/v1/assignments/3").set("authorization", `Bearer ${token}`);
}

describe("GET /assignments/:id — the student read gate", () => {
  it("lets a student with an ACTIVE enrolment through", async () => {
    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status: "ACTIVE" });
    const res = await get(await tokenFor({ activeSeasonId: 8 }));
    expect(res.status).toBe(404);
  });

  it.each(["WITHDRAWN", "COMPLETED"])(
    "lets a %s student read their past season's assignment (it comes back readOnly)",
    async (status) => {
      mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status });
      const res = await get(await tokenFor({ activeSeasonId: 8, graduationYear: 2098 }));
      expect(res.status).toBe(404); // past the gate; the loader answers null
      expect(mockLoad).toHaveBeenCalled();
    },
  );

  it("refuses a student with no enrolment, even in the token's season", async () => {
    mockDb.seasonEnrollment.findUnique.mockResolvedValue(null);
    const res = await get(await tokenFor({ activeSeasonId: 7 }));
    expect(res.status).toBe(403);
    expect(mockLoad).not.toHaveBeenCalled();
  });
});
