/**
 * Student reads and the one student write path. `list` is the scoped,
 * sortable list (and the dropped-enrolment list), `detail` the role-shaped
 * profile, `history` the per-season attendance and submission reads, and
 * `lib/students/create` the creation/enrolment path shared with the bulk importer (re-exported here).
 * Import from this index.
 */
export { listStudents, type StudentListResult } from "./list";
export { canReadEnrollmentHistory, loadStudentAttendanceHistory, loadStudentSubmissions } from "./history";
export { loadStudentDetail, type StudentDetail, type StudentDetailView } from "./detail";
export {
  createStudentRows,
  enrollStudentsInSeason,
  type NewEnrollment,
  type NewStudentInput,
  type StudentCreateTarget,
} from "../../students/create";
