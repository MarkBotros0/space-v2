import type { SeasonStatus } from "./enums";

// Response shapes for the mobile client.
//
// Every timestamp is `string`, not `Date`: the backend hands Prisma Date objects
// to res.json(), which serialises them to ISO-8601. These interfaces describe
// what arrives over the wire, so only the client should import them — the
// backend's own objects hold Dates and would not typecheck against these.

export interface SeasonListItem {
  id: number;
  code: string;
  title: string;
  program: string;
  year: number;
  status: SeasonStatus;
  startDate: string;
  endDate: string;
}

export interface SeasonDetailGroup {
  id: number;
  name: string;
  studentCount: number;
  leaderNames: string[];
}

export interface SeasonDetail {
  id: number;
  code: string;
  title: string;
  program: string;
  year: number;
  description: string | null;
  status: SeasonStatus;
  startDate: string;
  endDate: string;
  sessionCount: number;
  studentCount: number;
  groups: SeasonDetailGroup[];
}
