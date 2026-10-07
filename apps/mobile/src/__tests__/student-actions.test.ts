import type { EnrollmentHistoryItem } from "@space/shared";

import { studentActionsFor } from "../lib/student-actions";
import { makeScopes, makeUser } from "./helpers/session";

const row = (seasonId: number, status: EnrollmentHistoryItem["status"]): EnrollmentHistoryItem => ({
  enrollmentId: 500 + seasonId,
  seasonId,
  seasonCode: `S${seasonId}`,
  seasonTitle: `Season ${seasonId}`,
  seasonStatus: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  groupName: null,
  status,
  enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null,
  droppedAt: null,
  dropReason: null,
});

const student = { graduationYear: null, enrollments: [row(7, "ACTIVE"), row(8, "ACTIVE"), row(9, "WITHDRAWN")] };

describe("studentActionsFor (Plan 10 Decision 6 — mirrors the server gates)", () => {
  it("gives SUPER everything, and Drop on every ACTIVE row only", () => {
    const a = studentActionsFor(makeUser("SUPER"), makeScopes(), student);
    expect(a).toMatchObject({ canEdit: true, canEditSeasonPointer: true, canGraduate: true, canDelete: true });
    expect(student.enrollments.map(a.canDrop)).toEqual([true, true, false]);
  });

  it("gives an ADMIN Edit and Drop for their own season only — never Graduate or Delete (R55, R64/R68)", () => {
    const a = studentActionsFor(makeUser("ADMIN"), makeScopes({ seasonAdminIds: [7] }), student);
    expect(a).toMatchObject({ canEdit: true, canEditSeasonPointer: false, canGraduate: false, canDelete: false });
    expect(student.enrollments.map(a.canDrop)).toEqual([true, false, false]);
  });

  it("refuses ADMIN Edit when their season's enrollment is no longer ACTIVE (Plan 7's canEditStudent)", () => {
    const a = studentActionsFor(makeUser("ADMIN"), makeScopes({ seasonAdminIds: [9] }), student);
    expect(a.canEdit).toBe(false);
  });

  it("ignores a stray season-admin claim on a non-ADMIN role (ruling C7)", () => {
    const a = studentActionsFor(makeUser("STUDENT"), makeScopes({ seasonAdminIds: [7] }), student);
    expect(a.canEdit).toBe(false);
    expect(student.enrollments.map(a.canDrop)).toEqual([false, false, false]);
  });

  it("hides Graduate once graduated (R63) and grants nothing without a session", () => {
    expect(studentActionsFor(makeUser("SUPER"), makeScopes(), { ...student, graduationYear: 2020 }).canGraduate).toBe(false);
    const none = studentActionsFor(null, null, student);
    expect(none).toMatchObject({ canEdit: false, canGraduate: false, canDelete: false });
  });
});
