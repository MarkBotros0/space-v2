import { expectedStudentIds } from "../lib/queries/reports/expected";

const enrollments = [
  { studentUserId: 1, status: "ACTIVE" as const },
  { studentUserId: 2, status: "COMPLETED" as const },
  { studentUserId: 3, status: "COMPLETED" as const },
  { studentUserId: 4, status: "WITHDRAWN" as const },
  { studentUserId: 5, status: "ACTIVE" as const },
];

const ids = (s: Set<number>) => [...s].sort((a, b) => a - b);

describe("expectedStudentIds", () => {
  it("expects every enrolment of the season, ACTIVE and COMPLETED, never WITHDRAWN", () => {
    expect(ids(expectedStudentIds(enrollments))).toEqual([1, 2, 3, 5]);
  });

  it("keeps a finished season's bar measurable once every enrolment is COMPLETED", () => {
    const finished = enrollments.map((e) => (e.status === "ACTIVE" ? { ...e, status: "COMPLETED" as const } : e));
    expect(expectedStudentIds(finished).size).toBe(4);
  });

  it("is empty for a season with nobody in it", () => {
    expect(expectedStudentIds([]).size).toBe(0);
  });
});
