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
  email: string;
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
