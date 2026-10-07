import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Spec 19 §7 / D24: every mutation that moves a number on some role's Home is
 * tagged, so the MutationCache invalidates `queryKeys.dashboard.all` after it.
 * A source scan, because the alternative — rendering 27 hooks against a live
 * cache — tests React Query, not us. Adding a dashboard-moving mutation later
 * means adding a row here.
 */
const TAGGED: readonly (readonly [file: string, hook: string])[] = [
  ["use-submission.ts", "useSaveSubmission"],
  ["use-submission.ts", "useReviewSubmission"],
  ["use-attendance.ts", "useSaveAttendance"],
  ["use-check-in.ts", "useCheckIn"],
  ["use-quizzes.ts", "useSubmitAttempt"],
  ["use-quizzes.ts", "useSaveQuizGrades"],
  ["use-quizzes.ts", "useGradeEssays"],
  ["use-quizzes.ts", "useReopenAttempt"],
  ["use-quiz-authoring.ts", "useCreateQuiz"],
  ["use-quiz-authoring.ts", "usePublishQuiz"],
  ["use-assignment-writes.ts", "useCreateAssignment"],
  ["use-assignment-writes.ts", "useUpdateAssignment"],
  ["use-assignment-writes.ts", "useDeleteAssignment"],
  ["use-students.ts", "useCreateStudent"],
  ["use-students.ts", "useGraduateStudent"],
  ["use-students.ts", "useDeleteStudent"],
  ["use-students.ts", "useDropEnrollment"],
  ["use-session-writes.ts", "useCreateSession"],
  ["use-session-writes.ts", "useUpdateSession"],
  ["use-session-writes.ts", "useDeleteSession"],
  ["use-group-admin.ts", "useSaveGroupAssignments"],
  ["use-group-admin.ts", "useDeleteGroup"],
  ["use-forum.ts", "useSubmitForumResponse"],
];

/** The source of one exported hook: from its declaration to the next top-level export. */
function hookSource(file: string, hook: string): string {
  const src = readFileSync(join(__dirname, "..", "hooks", file), "utf8");
  const start = src.indexOf(`export function ${hook}(`);
  if (start === -1) throw new Error(`${hook} not found in ${file}`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("dashboard-moving mutations carry DASHBOARD_META (spec 19 D24)", () => {
  it.each(TAGGED)("%s → %s", (file, hook) => {
    expect(hookSource(file, hook)).toContain("meta: DASHBOARD_META");
  });
});
