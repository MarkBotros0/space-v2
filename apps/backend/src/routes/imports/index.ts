/**
 * Import intake is NOT gated by `ENABLE_UPLOADS`, and nothing in this folder
 * touches the `Storage` interface. Read this before "fixing" that.
 *
 * `ENABLE_UPLOADS` is off because *persisted* files — submission attachments —
 * need a storage driver, a retention story and a serving route, and that work
 * waits on the CMS. An import paste is the opposite: it is read once, parsed
 * in memory, and must NEVER be stored, because it is a sheet of students'
 * names, phone numbers, birth dates and pastoral notes. Sharing one flag
 * between the two would make them look like one concern and then enforce the
 * confusion (spec 16 §10a, decision D-16.2).
 */
export { importJsonParser, importLimiter } from "./limits";
export { importsRouter } from "./students";
export { seasonImportsRouter } from "./season-groups";
