import { z } from "zod";

/**
 * A list's `cursor` query param when the cursor is a row id: optional, a
 * positive integer, coerced from the query string. Opaque compound cursors
 * (events, announcements, reports) keep their own schemas.
 */
export const idCursorSchema = z.coerce.number().int().positive().optional();
