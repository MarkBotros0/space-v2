// Assignment wording shared by the staff list, detail and tracker (Plan 5).
import type {
  AssignmentDetail,
  AssignmentStudentStatus,
  AssignmentTrackerRow,
  MimeCategory,
} from "@space/shared";

/** v1's labels, verbatim (`assignment-form.tsx:24-31`). */
export const MIME_CATEGORY_LABELS: Record<MimeCategory, string> = {
  image: "Images",
  pdf: "PDFs",
  doc: "Documents (Word, ODF)",
  audio: "Audio",
  video: "Video",
  text: "Plain text",
};

/**
 * Who an assignment is given to, in words. Names come from the season's group
 * list; ids it cannot name (list still loading, or a leader whose list the
 * server narrowed to their own groups) are counted rather than shown as ids.
 */
export function targetLabel(
  isAllGroups: boolean,
  groupIds: number[],
  groups: { id: number; name: string }[] | undefined,
): string {
  if (isAllGroups) return "All students";
  const byId = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const names = groupIds.flatMap((id) => {
    const name = byId.get(id);
    return name === undefined ? [] : [name];
  });
  if (names.length === 0) return `${groupIds.length} group${groupIds.length === 1 ? "" : "s"}`;
  const unnamed = groupIds.length - names.length;
  return unnamed > 0 ? `${names.join(", ")} + ${unnamed} more` : names.join(", ");
}

/** A tracker row's state. PENDING is the wire-only "no submission row" sentinel. */
export function trackerStatusLabel(status: AssignmentStudentStatus): string {
  switch (status) {
    case "PENDING":
      return "Not started";
    case "DRAFT":
      return "Draft";
    case "SUBMITTED":
      return "Submitted";
    case "REVIEWED":
      return "Reviewed";
    case "RETURNED":
      return "Returned";
  }
}

/** The type-specific settings in one line (v1 showed them only inside the form). */
export function configLabel(
  d: Pick<
    AssignmentDetail,
    "type" | "forumMinWords" | "forumAllowComments" | "maxFileSizeMb" | "allowedMimeCategories"
  >,
): string {
  if (d.type === "FORUM") {
    const base = `Forum · at least ${d.forumMinWords ?? 0} words`;
    return d.forumAllowComments ? `${base} · peer comments on` : base;
  }
  // R10: a null size IS the "accepts no files" flag.
  if (d.maxFileSizeMb === null) return "Standard · no file uploads";
  const types =
    d.allowedMimeCategories.length === 0
      ? "any type"
      : d.allowedMimeCategories.map((c) => MIME_CATEGORY_LABELS[c]).join(", ");
  return `Standard · files up to ${d.maxFileSizeMb} MB (${types})`;
}

export interface TrackerGroup {
  groupId: number | null;
  groupName: string;
  rows: AssignmentTrackerRow[];
}

/**
 * Buckets the tracker's rows by group for section headers (REG-84). The server
 * orders rows group then student, so consecutive rows with one groupId are one
 * section; the no-group rows come last and are headed "No group".
 */
export function groupTrackerRows(rows: AssignmentTrackerRow[]): TrackerGroup[] {
  const groups: TrackerGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.groupId === row.groupId) last.rows.push(row);
    else groups.push({ groupId: row.groupId, groupName: row.groupName ?? "No group", rows: [row] });
  }
  return groups;
}
