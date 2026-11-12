import request from "supertest";
import type { Workbook } from "exceljs";

import {
  assignmentDetailSchema,
  assignmentProgressSchema,
  studentAssignmentListItemSchema,
} from "../../../../../packages/shared/src/index";
import { createApp } from "../../app";
import { db } from "../../db/client";
import { sendDueAssignmentReminders } from "../../lib/assignments/reminder";
import { buildSeasonWorkbook } from "../../lib/exports/season-workbook";
import { computeEngagementForSeasons } from "../../lib/queries/engagement";
import { buildEngagementSummary, resolveReportScope } from "../../lib/queries/reports";
import { createAssignmentWithParts } from "./assignment-reads-setup";
import { bearer, cleanupTestData } from "./fixtures";
import { putMark, seedStaffMarkWorld, type StaffMarkWorld } from "./assignment-staff-mark-setup";

jest.setTimeout(60000);

const app = createApp();
let w: StaffMarkWorld;
let assignmentId: number;

// The reminder was due Tue 11 Nov 2025 at 09:00 Cairo, 2 days before Thursday.
const REMIND_AT = new Date("2025-11-11T07:00:00.000Z");
const NOW = new Date("2025-11-11T07:05:00.000Z");

beforeAll(async () => {
  w = await seedStaffMarkWorld();
  const a = await createAssignmentWithParts({ seasonId: w.seasonId, title: "Done on paper" }, [{ kind: "ESSAY" }]);
  assignmentId = a.id;
  const marked = await putMark(app, assignmentId, w.ownerId, w.tokens.leaderA);
  if (marked.status !== 200) throw new Error(`fixture mark failed: ${marked.status}`);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const get = (path: string, token: string) => request(app).get(path).set(bearer(token));

function sheetRows(workbook: Workbook, name: string): unknown[][] {
  const out: unknown[][] = [];
  workbook.getWorksheet(name)!.eachRow((row) => out.push((row.values as unknown[]).slice(1)));
  return out;
}

describe("every reader agrees a staff mark is submitted", () => {
  it("the staff progress view shows who marked it, sorts it after the unsubmitted, and offers marking", async () => {
    const res = await get(`/api/v1/assignments/${assignmentId}/progress`, w.tokens.admin);
    expect(res.status).toBe(200);
    const progress = assignmentProgressSchema.parse(res.body.data);
    expect(progress.canMark).toBe(true);
    expect(progress.rows.map((r) => r.studentUserId)).toEqual([w.peerId, w.ownerId]);
    const owner = progress.rows[1]!;
    expect(owner.submittedAt).toBeNull();
    expect(owner.staffMark).toEqual({ markedAt: expect.any(String), markedByName: "Test mark-leader-a" });
    expect(progress.rows[0]!.staffMark).toBeNull();
  });

  it("the staff list counts it", async () => {
    const res = await get(`/api/v1/seasons/${w.seasonId}/assignments`, w.tokens.admin);
    expect(res.status).toBe(200);
    const row = (res.body.data.assignments as { id: number; submissionCount: number }[]).find(
      (r) => r.id === assignmentId,
    );
    expect(row?.submissionCount).toBe(1);
  });

  it("engagement and the report summary count it", async () => {
    const rows = await computeEngagementForSeasons([w.seasonId]);
    expect(rows.find((r) => r.studentUserId === w.ownerId)?.submissionsCompleted).toBe(1);
    expect(rows.find((r) => r.studentUserId === w.peerId)?.submissionsCompleted).toBe(0);

    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [w.seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    expect(summary.completion.find((r) => r.assignmentId === assignmentId)).toMatchObject({
      expected: 2,
      completed: 1,
    });
  });

  it("the workbook prints it submitted", async () => {
    const result = (await buildSeasonWorkbook(w.seasonId))!;
    const rows = sheetRows(result.workbook, "Assignments");
    const col = rows[0]!.indexOf("Done on paper");
    expect(rows.find((r) => r[0] === "Test mark-owner")![col]).toBe("Submitted");
    expect(rows.find((r) => r[0] === "Test mark-peer")![col]).toBe("Not submitted");
  });

  it("My work reads it as reviewed and marked, and Home no longer counts it outstanding", async () => {
    const list = await get(`/api/v1/seasons/${w.seasonId}/assignments`, w.tokens.owner);
    expect(list.status).toBe(200);
    const item = studentAssignmentListItemSchema
      .array()
      .parse(list.body.data.assignments)
      .find((r) => r.id === assignmentId)!;
    expect(item).toMatchObject({ status: "REVIEWED", staffMarked: true, submittedAt: null });

    const detail = await get(`/api/v1/assignments/${assignmentId}`, w.tokens.owner);
    expect(assignmentDetailSchema.parse(detail.body.data).my).toMatchObject({ submittedAt: null, staffMarked: true });

    const home = await get("/api/v1/me/dashboard", w.tokens.owner);
    expect(home.status).toBe(200);
    expect((home.body.data.assignments.open as { id: number }[]).map((r) => r.id)).not.toContain(assignmentId);
    const peerHome = await get("/api/v1/me/dashboard", w.tokens.peer);
    expect((peerHome.body.data.assignments.open as { id: number }[]).map((r) => r.id)).toContain(assignmentId);
  });

  it("the student's history lists it for staff", async () => {
    const res = await get(`/api/v1/students/${w.ownerId}/submissions`, w.tokens.admin);
    expect(res.status).toBe(200);
    const item = (res.body.data.submissions as { assignmentId: number; status: string }[]).find(
      (r) => r.assignmentId === assignmentId,
    );
    expect(item?.status).toBe("REVIEWED");
  });

  it("the reminder sweep skips them", async () => {
    await db.assignment.update({
      where: { id: assignmentId },
      data: { reminderEnabled: true, remindAt: REMIND_AT, reminderDays: 2, remindedAt: null },
    });
    await sendDueAssignmentReminders(NOW);
    const told = await db.notification.findMany({
      where: { type: "ASSIGNMENT_REMINDER", link: `/student/assignments/${assignmentId}` },
      select: { userId: true },
    });
    expect(told.map((n) => n.userId)).toEqual([w.peerId]);
  });
});
