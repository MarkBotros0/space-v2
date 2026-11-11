/**
 * The part sheets' shared field rules: a whole-number field read from what was
 * typed, and the kinds' names as the author sees them.
 */
import type { AssignmentPartKind } from "@space/shared";

import type { PartDraft } from "../../../lib/assignment-form-values";

export type VideoDraft = Extract<PartDraft, { kind: "VIDEO" }>;
export type EssayDraft = Extract<PartDraft, { kind: "ESSAY" }>;
export type ForumDraft = Extract<PartDraft, { kind: "FORUM" }>;

/** What a sheet asks of its parent. `initial` is null for a new part. */
export interface PartSheetProps<D> {
  open: boolean;
  onClose: () => void;
  initial: D | null;
  onSave: (part: Omit<D, "key" | "id">) => void;
}

/** The kinds as the Parts tab names them ("Move Essay question up"). */
export const PART_KIND_NAMES: Record<AssignmentPartKind, string> = {
  VIDEO: "Video",
  ESSAY: "Essay question",
  FORUM: "Forum",
};

type WholeNumber = { value: number | null; error?: undefined } | { value?: undefined; error: string };

/** A blank field is null; anything else must be a whole number from `min` to `max`. */
export function wholeNumberIn(text: string, min: number, max: number): WholeNumber {
  const t = text.trim();
  if (t === "") return { value: null };
  if (!/^\d+$/.test(t)) return { error: "Enter a whole number" };
  const n = Number(t);
  if (n < min || n > max) return { error: `Enter a number from ${min} to ${max}` };
  return { value: n };
}

/** A number back to what the field shows: blank for none. */
export const numberText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
