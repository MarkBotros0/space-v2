import { sendInviteEmail } from "../lib/email";

/**
 * Mail an invite after the transaction that minted it has committed.
 *
 * Best-effort, v1's behaviour and the right one: a transport failure must not
 * roll back the account (R25) — the invite row's existence is the truth, and
 * the operator can re-send from the detail screen. The log names the user id
 * and the error, never the address or the code (Plan 9 / Plan 10 Decision 2).
 *
 * Shared by POST /users, POST /users/:id/invite and POST /students, the three
 * places an invite is issued.
 */
export async function sendInviteEmailBestEffort(
  userId: number,
  email: string,
  raw: string,
  expiresAt: Date,
): Promise<void> {
  try {
    await sendInviteEmail(email, raw, expiresAt);
  } catch (err) {
    console.error(
      `[invites] failed to send invite email for user ${userId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
