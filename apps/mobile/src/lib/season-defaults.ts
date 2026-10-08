import { slugifySeasonCode } from "@space/shared";

/**
 * The code a season gets while its code field is untouched: v1's
 * `slugifySeasonCode(`${program} ${year}`)` (season-form.tsx:101-105). Empty
 * until both program and year are present, as v1 waits for both.
 */
export function autoSeasonCode(program: string, year: string | number): string {
  const y = String(year).trim();
  if (program.trim() === "" || y === "" || y === "0" || y === "NaN") return "";
  return slugifySeasonCode(`${program.trim()} ${y}`);
}

/**
 * v1's date-fns `addYears` over an ISO instant: same month/day one year on,
 * clamped to the month's end (29 Feb -> 28 Feb). Unparseable input is
 * returned unchanged so the field stays editable.
 */
export function addYearsIso(iso: string, years: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d.toISOString();
}
