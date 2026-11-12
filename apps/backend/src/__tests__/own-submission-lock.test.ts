/**
 * `lockOwnSubmission` finds or makes the student's Submission and locks it. A Submission found and
 * then deleted before the lock was granted (a staff mark's undo) locks no row: the helper makes it
 * again once, and refuses cleanly (409) rather than writing work against a row that is gone.
 */
import type { Prisma } from "../generated/prisma/client";
import { ApiError } from "../lib/api-error";
import { lockOwnSubmission } from "../lib/assignments/essay";

function fakeTx(lockResults: unknown[][], found: ({ id: number } | null)[]) {
  const tx = {
    submission: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  for (const f of found) tx.submission.findUnique.mockResolvedValueOnce(f);
  for (const r of lockResults) tx.$queryRaw.mockResolvedValueOnce(r);
  return tx;
}

const asTx = (tx: ReturnType<typeof fakeTx>) => tx as unknown as Prisma.TransactionClient;

describe("lockOwnSubmission", () => {
  it("locks the Submission it finds", async () => {
    const tx = fakeTx([[{ id: 7 }]], [{ id: 7 }]);
    await expect(lockOwnSubmission(asTx(tx), 1, 2)).resolves.toEqual({ id: 7 });
    expect(tx.submission.createMany).toHaveBeenCalledTimes(1);
  });

  it("makes it again once when the row it found was deleted before the lock", async () => {
    const tx = fakeTx([[], [{ id: 8 }]], [{ id: 7 }, { id: 8 }]);
    await expect(lockOwnSubmission(asTx(tx), 1, 2)).resolves.toEqual({ id: 8 });
    expect(tx.submission.createMany).toHaveBeenCalledTimes(2);
  });

  it("refuses with 409 when the second try finds no row either", async () => {
    const tx = fakeTx([[], []], [{ id: 7 }, null]);
    const err = await lockOwnSubmission(asTx(tx), 1, 2).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "work_changed", status: 409 });
  });
});
