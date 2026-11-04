import { expectedStudentIds } from "../lib/queries/reports/expected";

const enrollments = [
  { studentUserId: 1, groupId: 10, status: "ACTIVE" as const },
  { studentUserId: 2, groupId: 10, status: "COMPLETED" as const },
  { studentUserId: 3, groupId: 20, status: "COMPLETED" as const },
  { studentUserId: 4, groupId: 10, status: "WITHDRAWN" as const },
  { studentUserId: 5, groupId: null, status: "ACTIVE" as const },
];

const ids = (s: Set<number>) => [...s].sort((a, b) => a - b);

describe("expectedStudentIds", () => {
  it("counts ACTIVE and COMPLETED enrolments, never WITHDRAWN", () => {
    expect(ids(expectedStudentIds(enrollments, { isAllGroups: true, targets: [] }))).toEqual([
      1, 2, 3, 5,
    ]);
  });

  it("keeps a finished season's bar measurable once every enrolment is COMPLETED", () => {
    const finished = enrollments.map((e) =>
      e.status === "ACTIVE" ? { ...e, status: "COMPLETED" as const } : e,
    );
    expect(expectedStudentIds(finished, { isAllGroups: true, targets: [] }).size).toBe(4);
  });

  it("narrows a targeted assignment to its groups; an unassigned enrolment never matches", () => {
    expect(
      ids(expectedStudentIds(enrollments, { isAllGroups: false, targets: [{ groupId: 10 }] })),
    ).toEqual([1, 2]);
  });

  it("is empty for a targeted assignment with no targets", () => {
    expect(expectedStudentIds(enrollments, { isAllGroups: false, targets: [] }).size).toBe(0);
  });
});
