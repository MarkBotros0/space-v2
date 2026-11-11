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
  ["use-submission.ts", "useSaveEssayDraft"],
  ["use-submission.ts", "useHandInEssay"],
  ["use-submission.ts", "useSubmitAssignment"],
  ["use-submission.ts", "useReviewEssay"],
  ["use-video-quiz.ts", "useSubmitPartVideoAnswer"],
  ["use-attendance.ts", "useSaveAttendance"],
  ["use-check-in.ts", "useCheckIn"],
  ["use-quizzes/student.ts", "useSubmitAttempt"],
  ["use-quizzes/grading.ts", "useSaveQuizGrades"],
  ["use-quizzes/grading.ts", "useMarkAttempt"],
  ["use-quizzes/grading.ts", "useReopenAttempt"],
  ["use-quiz-authoring.ts", "useCreateQuiz"],
  ["use-quiz-authoring.ts", "usePublishQuiz"],
  ["use-assignment-writes.ts", "useCreateAssignment"],
  ["use-assignment-writes.ts", "useUpdateAssignment"],
  ["use-assignment-writes.ts", "useDeleteAssignment"],
  ["use-students/writes.ts", "useCreateStudent"],
  ["use-students/writes.ts", "useGraduateStudent"],
  ["use-students/writes.ts", "useDeleteStudent"],
  ["use-students/writes.ts", "useDropEnrollment"],
  ["use-session-writes.ts", "useCreateSession"],
  ["use-session-writes.ts", "useUpdateSession"],
  ["use-session-writes.ts", "useDeleteSession"],
  ["use-group-admin.ts", "useSaveGroupAssignments"],
  ["use-group-admin.ts", "useCreateGroup"],
  ["use-group-admin.ts", "useUpdateGroup"],
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
