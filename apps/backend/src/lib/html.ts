/**
 * The backend's ONE way to escape text for an HTML sink (ruling X2). Every
 * mail template and every future HTML interpolation imports escapeHtml from
 * here — never a private copy in the file that needs it.
 *
 * The function is defined once, in packages/shared/src/html-text.ts (ruling
 * X3 — the same module holds plainTextToHtml/htmlToPlainText, and the
 * write half needs the escaper), and re-exported here so backend callers have
 * one stable local path. Relative value import, not "@space/shared": the
 * rootDir emit trap applies to every backend file (ruling X12).
 */
export { escapeHtml } from "../../../../packages/shared/src/index";
