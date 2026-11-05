import type { NoteVisibility } from "@space/shared";

/**
 * The truth about the visibility setting, in the words the API enforces.
 *
 * v1's composer said "Who can read this note (in addition to you and admins)",
 * which was simply false: filterVisibleNotes matches the viewer's role against
 * the setting by EQUALITY, so an admin reads none of the LEADERS notes the
 * schema defaults to and none of the MENTORS notes the mentor composer
 * hard-coded (spec R36, D3). Widening the rule to match the old copy would
 * retroactively expose historic notes; fixing the copy does not.
 */
export const VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  LEADERS: "Visible to group leaders only",
  MENTORS: "Visible to mentors only",
  ADMINS: "Visible to season admins only",
};

/** The composer's explanation under the "Visible to" control. */
export const VISIBILITY_DESCRIPTION =
  "Only the group you choose can read this note, plus you and SUPER users. Season admins do not automatically see leader or mentor notes.";
