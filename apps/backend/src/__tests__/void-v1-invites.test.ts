// Plan 18 M12 (migration 20261105110000_void_v1_invite_codes) overwrites every
// v1 plaintext invite code with 'v1-void-<id>'. The migration has no code
// consumers; what it relies on is that a voided row reads exactly as the v1
// row did: never a working v2 invite, so its holder stays in the bulk
// re-invite's pending pool. These tests pin that, with the database mocked.

const mockDb = { user: { findMany: jest.fn() } };
jest.mock("../db/client", () => ({ db: mockDb }));

import { hashToken } from "../lib/auth/tokens";
import { isV2InviteDigest, listPendingInviteUserIds } from "../lib/invites";

beforeEach(() => jest.resetAllMocks());

describe("voided v1 invite codes (Plan 18 M12)", () => {
  it("a voided code is never mistaken for a v2 digest, and a v2 digest still is one", () => {
    expect(isV2InviteDigest("v1-void-42")).toBe(false);
    expect(isV2InviteDigest("aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY")).toBe(false); // a v1 code, before
    expect(isV2InviteDigest(hashToken("raw-code"))).toBe(true);
  });

  it("the holder of a voided invite is still pending; the holder of a v2 invite is not", async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: 1, invitesReceived: [{ token: "v1-void-7" }] },
      { id: 2, invitesReceived: [{ token: hashToken("live") }] },
      { id: 3, invitesReceived: [] },
    ]);
    await expect(listPendingInviteUserIds()).resolves.toEqual([1, 3]);
  });
});
