// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** v1's cap (spec R35), kept. */
export const IMPORT_MAX_ROWS = 2000;

/**
 * 256 KB of pasted text. This REPLACES v1's 5 MB file ceiling (R3), which was
 * a file-size limit checked after the whole file had already reached the
 * server. 5 MB of text is not a realistic paste, it is a request body; 256 KB
 * comfortably holds 2000 rows with eight populated columns. The client checks
 * it before spending a request and the server checks it again, because a
 * client-side limit is a courtesy and not a control.
 */
export const IMPORT_MAX_PASTE_CHARS = 256 * 1024;
