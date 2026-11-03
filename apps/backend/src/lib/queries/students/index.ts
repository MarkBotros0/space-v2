/**
 * Student reads and the one student write path. `list` is the scoped,
 * sortable list (and the dropped-enrolment list), `detail` the role-shaped
 * profile, `history` the per-season attendance and submission reads, and
 * `writes` the creation/enrolment path shared with the bulk importer.
 * Import from this index.
 */
export { listStudents, type StudentListResult } from "./list";
export { loadStudentAttendanceHistory, loadStudentSubmissions } from "./history";
export { loadStudentDetail, type StudentDetail, type StudentDetailView } from "./detail";
export {
  createStudentRows,
  enrollStudentInSeason,
  type NewStudentInput,
  type StudentCreateTarget,
} from "./writes";
