import { parsePositiveInt } from "./params";

/** A positive integer season id from a route param, or undefined for any other value. */
export function seasonParam(raw: string | undefined): number | undefined {
  return parsePositiveInt(raw) ?? undefined;
}
