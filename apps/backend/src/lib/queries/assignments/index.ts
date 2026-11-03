/**
 * Assignment reads. `rules` holds the derived facts (overdue, late), `staff`
 * the season list and the tracker, `detail` the one-assignment payload, and
 * `student` what a student was given. Import from this index.
 */
export { groupIdInSeason } from "../enrollment";
export { isLate, isOverdue } from "./rules";
export {
  listAssignmentsForSeason,
  loadAssignmentTracker,
  type AssignmentListRow,
  type AssignmentTrackerData,
  type AssignmentTrackerRowData,
} from "./staff";
export {
  assignmentDetailPayload,
  loadAssignmentById,
  type AssignmentDetailData,
  type MySubmissionData,
} from "./detail";
export {
  listAssignmentStatesForStudent,
  listAssignmentsForStudent,
  studentCanSeeAssignment,
  type StudentAssignmentRow,
  type StudentAssignmentStateRow,
} from "./student";
