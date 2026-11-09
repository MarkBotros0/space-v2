import type { SeasonRosterRow } from "@space/shared";

/**
 * The group form's members (owner, 2026-11-07): picked from the people already
 * in the season, never invited or enrolled here. Each row says where the
 * person is now, since picking someone from another group moves them.
 */
type MemberRow = { id: number; name: string; line: string };
type MemberSection = { key: "this" | "none" | "other"; title: string; rows: MemberRow[] };

const nameOf = (r: SeasonRosterRow) => r.name ?? r.email;

/** Where they are now, by the saved roster (not the unsaved ticks). */
export function memberLine(r: SeasonRosterRow, groupId: number | null): string {
  if (r.groupId !== null && r.groupId === groupId) return "In this group";
  if (r.groupId === null) return "Not in a group yet";
  return `In ${r.groupName ?? "another group"} · picking moves them here`;
}

/** In this group, Not in a group, In another group; a name search runs first, empty sections drop. */
export function memberSections(roster: SeasonRosterRow[], groupId: number | null, query: string): MemberSection[] {
  const q = query.trim().toLowerCase();
  const match = roster.filter(
    (r) => q === "" || nameOf(r).toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
  );
  const toRow = (r: SeasonRosterRow): MemberRow => ({ id: r.userId, name: nameOf(r), line: memberLine(r, groupId) });
  const sections: MemberSection[] = [
    {
      key: "this",
      title: "In this group",
      rows: match.filter((r) => r.groupId !== null && r.groupId === groupId).map(toRow),
    },
    { key: "none", title: "Not in a group", rows: match.filter((r) => r.groupId === null).map(toRow) },
    {
      key: "other",
      title: "In another group",
      rows: match.filter((r) => r.groupId !== null && r.groupId !== groupId).map(toRow),
    },
  ];
  return sections.filter((s) => s.rows.length > 0);
}

/** `3 members. 1 person in GBV 2026 isn't in a group.` */
export function membersSummary(roster: SeasonRosterRow[], picked: number[], groupId: number | null): string {
  const pickedSet = new Set(picked);
  const lead =
    picked.length === 0 ? "No members yet." : picked.length === 1 ? "1 member." : `${picked.length} members.`;
  const loose = roster.filter((r) => r.groupId === null && !pickedSet.has(r.userId)).length;
  const moving = roster.filter((r) => pickedSet.has(r.userId) && r.groupId !== null && r.groupId !== groupId).length;
  const parts = [lead];
  if (moving > 0)
    parts.push(moving === 1 ? "1 moves here from another group." : `${moving} move here from other groups.`);
  if (loose > 0)
    parts.push(
      loose === 1 ? "1 person in the season isn't in a group." : `${loose} people in the season aren't in a group.`,
    );
  return parts.join(" ");
}
