import { z } from "zod";

// Organisation wall-clock values on the wire (rulings C2, X13).
//
// An *instant* crosses the wire as an ISO-8601 string. A *wall-clock* value —
// "the 1st of April, 23:59, on the organisation's clock" — crosses as these
// two strings instead, and only the server turns one into the other, in
// config.orgTimezone. The device's timezone never enters: a form reads back
// exactly the day and time the user tapped and sends them as-is.
//
// Plan 5 created this module; Plan 14's event contracts import from it.

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealCalendarDay(value: string): boolean {
  const m = ISO_DAY_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}

/** An organisation-calendar day, `YYYY-MM-DD`. Never derived on a device (X13). */
export const isoDaySchema = z
  .string()
  .regex(ISO_DAY_RE, "Use YYYY-MM-DD.")
  .refine(isRealCalendarDay, "Not a real calendar day.");

/** A wall-clock time on the organisation clock, `HH:mm`, 24-hour. */
export const wallTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm.");
