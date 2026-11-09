/**
 * The daily retention purge (refactor DB-007 + DB-006, owner ruling Q13):
 * GET /api/v1/internal/retention/purge behind CRON_SECRET. Each rule is pinned
 * on both sides of its cutoff, and the newest invite survives however dead it is.
 */
import { randomUUID } from "node:crypto";

import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { config } from "../../lib/config";
import { MS_PER_DAY } from "../../lib/org-time";
import { cleanupTestData, createTestUser } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
const SECRET = "test-cron-secret-0123456789";
const ago = (days: number) => new Date(Date.now() - days * MS_PER_DAY);
const later = (days: number) => new Date(Date.now() + days * MS_PER_DAY);
const digest = () => randomUUID().replace(/-/g, "").padEnd(64, "0");

const purge = (authorization?: string) => {
  const call = request(app).get("/api/v1/internal/retention/purge");
  return authorization ? call.set("authorization", authorization) : call;
};

let userId: number;
let otherId: number;

beforeAll(async () => {
  await cleanupTestData();
  userId = (await createTestUser("retention", "STUDENT")).id;
  otherId = (await createTestUser("retention-other", "STUDENT")).id;
});

afterEach(() => {
  (config as { cronSecret?: string }).cronSecret = undefined;
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /internal/retention/purge", () => {
  it("is a 404 with no CRON_SECRET and a 401 with a wrong one, and deletes nothing then", async () => {
    const row = await db.refreshToken.create({
      data: { tokenHash: digest(), userId, expiresAt: ago(30) },
    });
    expect((await purge(`Bearer ${SECRET}`)).status).toBe(404);
    (config as { cronSecret?: string }).cronSecret = SECRET;
    expect((await purge("Bearer nope-nope-nope-nope")).status).toBe(401);
    expect(await db.refreshToken.findUnique({ where: { id: row.id } })).not.toBeNull();
    await db.refreshToken.delete({ where: { id: row.id } });
  });

  it("deletes tokens dead for more than 7 days and keeps the live and the recently dead", async () => {
    const refresh = {
      oldExpired: await db.refreshToken.create({ data: { tokenHash: digest(), userId, expiresAt: ago(8) } }),
      oldRevoked: await db.refreshToken.create({
        data: { tokenHash: digest(), userId, expiresAt: later(20), revokedAt: ago(8) },
      }),
      recentlyRevoked: await db.refreshToken.create({
        data: { tokenHash: digest(), userId, expiresAt: later(20), revokedAt: ago(6) },
      }),
      live: await db.refreshToken.create({ data: { tokenHash: digest(), userId, expiresAt: later(20) } }),
    };
    const reset = {
      oldUsed: await db.passwordResetToken.create({
        data: { tokenHash: digest(), userId, expiresAt: ago(8), usedAt: ago(9) },
      }),
      recentlyExpired: await db.passwordResetToken.create({
        data: { tokenHash: digest(), userId, expiresAt: ago(2) },
      }),
    };

    (config as { cronSecret?: string }).cronSecret = SECRET;
    const res = await purge(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted.refreshTokens).toBeGreaterThanOrEqual(2);

    const kept = async (model: "refreshToken" | "passwordResetToken", id: number) =>
      model === "refreshToken"
        ? (await db.refreshToken.findUnique({ where: { id } })) !== null
        : (await db.passwordResetToken.findUnique({ where: { id } })) !== null;
    expect(await kept("refreshToken", refresh.oldExpired.id)).toBe(false);
    expect(await kept("refreshToken", refresh.oldRevoked.id)).toBe(false);
    expect(await kept("refreshToken", refresh.recentlyRevoked.id)).toBe(true);
    expect(await kept("refreshToken", refresh.live.id)).toBe(true);
    expect(await kept("passwordResetToken", reset.oldUsed.id)).toBe(false);
    expect(await kept("passwordResetToken", reset.recentlyExpired.id)).toBe(true);
  });

  it("keeps each person's newest invite however dead, and deletes their older dead ones", async () => {
    const older = await db.inviteToken.create({
      data: { tokenHash: digest(), userId, invitedById: otherId, expiresAt: ago(40), createdAt: ago(47) },
    });
    const newestDead = await db.inviteToken.create({
      data: { tokenHash: digest(), userId, invitedById: otherId, expiresAt: ago(20), createdAt: ago(27) },
    });
    const onlyOne = await db.inviteToken.create({
      data: { tokenHash: digest(), userId: otherId, invitedById: userId, expiresAt: ago(40), createdAt: ago(47) },
    });

    (config as { cronSecret?: string }).cronSecret = SECRET;
    expect((await purge(`Bearer ${SECRET}`)).status).toBe(200);

    expect(await db.inviteToken.findUnique({ where: { id: older.id } })).toBeNull();
    expect(await db.inviteToken.findUnique({ where: { id: newestDead.id } })).not.toBeNull();
    expect(await db.inviteToken.findUnique({ where: { id: onlyOne.id } })).not.toBeNull();
  });

  it("deletes notifications older than 180 days and devices unseen for 180 days", async () => {
    const note = (createdAt: Date) =>
      db.notification.create({ data: { userId, type: "ANNOUNCEMENT", title: "t", createdAt } });
    const oldNote = await note(ago(181));
    const keptNote = await note(ago(179));
    const device = (lastSeenAt: Date) =>
      db.deviceToken.create({
        data: { userId, token: `ExponentPushToken[${randomUUID()}]`, platform: "IOS", lastSeenAt },
      });
    const staleDevice = await device(ago(181));
    const seenDevice = await device(ago(10));

    (config as { cronSecret?: string }).cronSecret = SECRET;
    const res = await purge(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toEqual({
      refreshTokens: expect.any(Number),
      inviteTokens: expect.any(Number),
      passwordResetTokens: expect.any(Number),
      notifications: expect.any(Number),
      deviceTokens: expect.any(Number),
    });

    expect(await db.notification.findUnique({ where: { id: oldNote.id } })).toBeNull();
    expect(await db.notification.findUnique({ where: { id: keptNote.id } })).not.toBeNull();
    expect(await db.deviceToken.findUnique({ where: { id: staleDevice.id } })).toBeNull();
    expect(await db.deviceToken.findUnique({ where: { id: seenDevice.id } })).not.toBeNull();
  });
});
