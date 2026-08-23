// Wire shapes — see the note in season.ts on why timestamps are strings.

export interface GroupListItem {
  id: number;
  name: string;
  description: string | null;
  studentCount: number;
  leaderNames: string[];
  seasonCode: string;
  seasonTitle: string;
}

export interface GroupMember {
  id: number;
  name: string | null;
  /**
   * Absent for student callers. A student may read their own group so the app
   * can show who is in it, but v1 only ever put this payload on staff pages —
   * a student's own view of their group was a separate, narrower query that
   * never selected addresses. Handing every member of a group each other's
   * email is a change v1 never made, so the API withholds it by role rather
   * than inheriting it from the staff shape.
   */
  email?: string;
}

export interface GroupDetail {
  id: number;
  name: string;
  description: string | null;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  leaders: GroupMember[];
  students: GroupMember[];
}
