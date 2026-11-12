import { createApp } from "../../app";
import { db } from "../../db/client";
import { ensurePartWork, lockAssignmentForWork, lockSubmissionForWork } from "../../lib/assignments/essay";
import { createAssignmentWithParts, seedTextWork } from "./assignment-reads-setup";
import { cleanupTestData } from "./fixtures";
import { behind, holdTransaction } from "./lock-holds";
import {
  deleteMark,
  putMark,
  seedStaffMarkWorld,
  submissionRow,
  type StaffMarkWorld,
} from "./assignment-staff-mark-setup";

// A held transaction plays the student's write; the staff call is sent behind it.
jest.setTimeout(90000);

const app = createApp();
let w: StaffMarkWorld;

beforeAll(async () => {
  w = await seedStaffMarkWorld();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("a staff mark against a student's own writes", () => {
  it("an undo waits for a student's first write and keeps the Submission it now holds", async () => {
    const a = await createAssignmentWithParts({ seasonId: w.seasonId, title: "Undo behind a write" }, [
      { kind: "ESSAY" },
    ]);
    expect((await putMark(app, a.id, w.ownerId, w.tokens.admin)).status).toBe(200);

    // The student's essay save: the Assignment FOR SHARE, then (once released) the Submission and its first work row.
    const held = await holdTransaction(
      (tx) => lockAssignmentForWork(tx, a.id),
      (tx) => ensurePartWork(tx, a.id, a.partIds[0]!, w.ownerId),
    );
    const undone = await behind(held, () => deleteMark(app, a.id, w.ownerId, w.tokens.admin));
    expect(undone.status).toBe(204);

    const row = await submissionRow(a.id, w.ownerId);
    expect(row).not.toBeNull();
    expect(row?.staffMark).toBeNull();
    expect(await db.assignmentPartWork.count({ where: { submissionId: row!.id } })).toBe(1);
  });

  it("a mark waits for a student writing a new part and both land", async () => {
    const a = await createAssignmentWithParts({ seasonId: w.seasonId, title: "Mark behind a write" }, [
      { kind: "ESSAY" },
      { kind: "ESSAY" },
    ]);
    await seedTextWork(a.id, a.partIds[0]!, w.ownerId, "DRAFT");
    const existing = (await submissionRow(a.id, w.ownerId))!;

    // The student holds their Submission and then writes their first work on the second part.
    const held = await holdTransaction(
      async (tx) => {
        await lockAssignmentForWork(tx, a.id);
        await lockSubmissionForWork(tx, existing.id);
      },
      (tx) => ensurePartWork(tx, a.id, a.partIds[1]!, w.ownerId),
    );
    const marked = await behind(held, () => putMark(app, a.id, w.ownerId, w.tokens.admin));
    expect(marked.status).toBe(200);

    const row = await submissionRow(a.id, w.ownerId);
    expect(row?.staffMark?.markedById).toBe(w.adminId);
    expect(await db.assignmentPartWork.count({ where: { submissionId: existing.id } })).toBe(2);
  });
});
