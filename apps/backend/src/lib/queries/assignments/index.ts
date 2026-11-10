/**
 * Assignment reads. `rules` holds the derived facts (overdue, late), `staff`
 * the season list and the leader's progress, `detail` the one-assignment
 * payload, `student` what a student has, and `part-work` a student's work on
 * each part. Import from this index.
 */
export { groupIdInSeason } from "../enrollment";
export { isLate, isOverdue } from "./rules";
export { listAssignmentsForSeason, loadAssignmentProgress, type AssignmentListRow } from "./staff";
export { loadAssignmentDetail, type AssignmentViewer } from "./detail";
export {
  listAssignmentStatesForStudent,
  listAssignmentsForStudent,
  studentCanSeeAssignment,
  type StudentAssignmentRow,
  type StudentAssignmentStateRow,
} from "./student";
export {
  assignmentStatusOf,
  loadPartWorks,
  loadWorkIndex,
  partWorksFor,
  PART_SELECT,
  reviewedAtOf,
  standingOf,
  type PartRow,
  type WorkIndex,
} from "./part-work";
