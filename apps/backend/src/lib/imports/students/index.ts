/**
 * The student bulk importer: `headers` maps a pasted sheet's columns,
 * `validation` is the one standard preview and commit share (plus the
 * case-insensitive existence lookup), `preview` classifies rows, `template`
 * describes the columns, and `commit` writes a batch all-or-nothing.
 * Import from this index.
 */
export { normaliseEmail } from "./validation";
export { buildStudentImportPreview } from "./preview";
export { studentImportTemplate } from "./template";
export {
  commitStudentImport,
  ImportRowsInvalidError,
  ImportSeasonGoneError,
  type StudentImportCommitRow,
  type StudentImportTarget,
} from "./commit";
