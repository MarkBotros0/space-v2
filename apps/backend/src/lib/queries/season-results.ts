import { db } from "../../db/client";
import {
  passingNumbersSchema,
  type PassingNumbers,
  type SeasonResultRow,
  type SeasonResultsResponse,
} from "../../../../../packages/shared/src/index";
import { attendancePct } from "./attendance-pct";
import { liveUser } from "../db/live";
import { loadOwnPassCriteria } from "../passing/criteria";
import { loadPassingNumbers } from "../passing/numbers";
import { toScore } from "../quizzes/score";

/** The stored numbers, or null for a row End wrote before weighted passing (or anything unreadable). */
function storedNumbers(json: unknown): PassingNumbers | null {
  const parsed = passingNumbersSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * A season's results: the season, the criteria End used (null for a season ended before weighted
 * passing), and its finished students with their result, the score and numbers End stored, whether
 * the result goes against that score, and who set it. WITHDRAWN students have none and are left
 * out. Attendance is the one formula (`loadPassingNumbers`): End's stored numbers, or, for a season
 * ended before them, read now.
 */
export async function loadSeasonResults(season: {
  id: number;
  code: string;
  title: string;
  year: number;
  graduatesOnPass: boolean;
}): Promise<SeasonResultsResponse> {
  const [criteria, enrollments] = await Promise.all([
    loadOwnPassCriteria(season.id),
    db.seasonEnrollment.findMany({
      where: { seasonId: season.id, status: "COMPLETED", studentUser: liveUser },
      orderBy: { studentUser: { name: "asc" } },
      select: {
        studentUserId: true,
        result: true,
        resultReason: true,
        resultSetAt: true,
        passScore: true,
        passNumbers: true,
        resultAgainstScore: true,
        resultSetBy: { select: { name: true } },
        studentUser: { select: { name: true, graduationYear: true } },
        group: { select: { name: true } },
      },
    }),
  ]);
  const stored = new Map(enrollments.map((e) => [e.studentUserId, storedNumbers(e.passNumbers)]));
  // By id: these are the COMPLETED rows just read, which the null-ids roster leaves out of a live season.
  const unstored = [...stored].filter(([, n]) => n === null).map(([uid]) => uid);
  const live =
    unstored.length > 0 ? (await loadPassingNumbers(season.id, unstored)).numbers : new Map<number, PassingNumbers>();
  const results: SeasonResultRow[] = enrollments.map((e) => {
    const numbers = stored.get(e.studentUserId) ?? null;
    const attendance = (numbers ?? live.get(e.studentUserId))?.attendance;
    return {
      userId: e.studentUserId,
      name: e.studentUser.name,
      isAlumnus: e.studentUser.graduationYear !== null,
      groupName: e.group?.name ?? null,
      attendancePct: attendancePct(attendance?.attended ?? 0, attendance?.total ?? 0),
      result: e.result,
      reason: e.resultReason,
      passScore: toScore(e.passScore),
      numbers,
      againstScore: e.resultAgainstScore ?? false,
      setByName: e.resultSetBy?.name ?? null,
      setAt: e.resultSetAt?.toISOString() ?? null,
    };
  });
  return { season, criteria, results };
}
