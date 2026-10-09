// apps/backend/src/lib/imports/groups.ts
import {
  IMPORT_EMAIL_HEADERS,
  IMPORT_GROUP_HEADERS,
  IMPORT_NAME_HEADERS,
  // Value import — relative path is mandatory (CLAUDE.md's rootDir emit trap).
} from "../../../../../packages/shared/src/index";
import type { GroupImportPreview } from "@space/shared";
import { z } from "zod";

import { db } from "../../db/client";
import { ImportParseError, type ParsedSheet } from "./delimited";
import { normaliseEmail } from "./students";

const emailSchema = z.string().trim().email();

interface HeaderMap {
  nameCol: number;
  emailCol: number;
  groupCol: number;
}

function mapGroupHeaders(header: string[]): HeaderMap {
  let nameCol = -1;
  let emailCol = -1;
  let groupCol = -1;

  header.forEach((raw, col) => {
    const key = raw.trim().toLowerCase();
    if (key === "") return;
    if ((IMPORT_NAME_HEADERS as readonly string[]).includes(key)) {
      if (nameCol === -1) nameCol = col;
    } else if ((IMPORT_EMAIL_HEADERS as readonly string[]).includes(key)) {
      if (emailCol === -1) emailCol = col;
    } else if ((IMPORT_GROUP_HEADERS as readonly string[]).includes(key)) {
      if (groupCol === -1) groupCol = col;
    }
  });

  if (emailCol === -1 || groupCol === -1) {
    throw new ImportParseError(
      'The first line must be a header row with "email" and "group" columns.',
    );
  }
  return { nameCol, emailCol, groupCol };
}

/**
 * Classify each pasted row against the season's roster and its groups.
 *
 * Order is invalid → no_student → no_group (blank) → no_group (unknown) →
 * unchanged → assign (spec R58). Two lookups, run in parallel, both bounded
 * by the season rather than by the paste — a 400-student season loads 400
 * rows to classify a 12-row paste, which is v1's cost too and is fine at this
 * scale.
 *
 * `name` is read for display only: never written, never validated (R56).
 */
export async function buildGroupImportPreview(
  sheet: ParsedSheet,
  seasonId: number,
): Promise<GroupImportPreview> {
  const map = mapGroupHeaders(sheet.header);

  const [enrolments, groups] = await Promise.all([
    // Ruling C9: "is this student in this season" resolves through
    // SeasonEnrollment. v1 asks StudentProfile.activeSeasonId
    // (groups-query.ts:143-148), so a student with an ACTIVE enrolment whose
    // pointer names another season is invisible here — and the write gates on
    // the same pointer and silently drops them (spec R61/R76).
    // ACTIVE only — the same population the commit (Plan 6's
    // assignStudentsToGroups) accepts, so a row that previews `assign` is a
    // row that gets written. A WITHDRAWN/COMPLETED enrolment is `no_student`.
    db.seasonEnrollment.findMany({
      where: { seasonId, status: "ACTIVE", studentUser: { role: "STUDENT", deletedAt: null } },
      select: { studentUserId: true, groupId: true, studentUser: { select: { email: true } } },
    }),
    db.group.findMany({ where: { seasonId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const studentByEmail = new Map(
    enrolments.map((e) => [
      normaliseEmail(e.studentUser.email),
      { userId: e.studentUserId, groupId: e.groupId },
    ]),
  );

  // D-16.19.1 (R65, v1 parity 2026-10-09; owner decision 2026-10-10):
  // Group.name may repeat within a season, as v1 (05-R15). The paste is
  // never refused for it; only a row naming an ambiguous group is — v1's
  // silent last-wins guess (`group-import.ts:59`) is not ported. Every id per
  // trimmed, lower-cased name.
  const groupByName = new Map<string, number[]>();
  for (const g of groups) {
    const key = g.name.trim().toLowerCase();
    groupByName.set(key, [...(groupByName.get(key) ?? []), g.id]);
  }

  const rows: GroupImportPreview["rows"] = [];

  for (const parsedRow of sheet.rows) {
    const at = (col: number): string => (col >= 0 ? (parsedRow.cells[col] ?? "").trim() : "");
    const name = at(map.nameCol);
    const email = at(map.emailCol);
    const group = at(map.groupCol);
    const base = { rowNumber: parsedRow.rowNumber, name, email, group, studentUserId: null, groupId: null };

    // Unlike the student importer (R20), a row carrying only a name is
    // skipped: it addresses nobody and names no group (R57). The parser has
    // already dropped fully blank lines.
    if (!email && !group) continue;

    if (!emailSchema.safeParse(email).success) {
      rows.push({ ...base, status: "invalid", message: "Email is not valid." });
      continue;
    }
    const student = studentByEmail.get(normaliseEmail(email));
    if (!student) {
      rows.push({ ...base, status: "no_student", message: "No student with this email in this season." });
      continue;
    }
    if (!group) {
      // A blank cell is NOT an unassign (spec R69 / D-16.19.4): an
      // accidentally empty column must never be able to wipe a season's
      // groupings. The reserved-literal design for a real bulk unassign is
      // recorded in D-16.19.
      rows.push({ ...base, status: "no_group", message: "No group specified.", studentUserId: student.userId });
      continue;
    }
    const groupIds = groupByName.get(group.toLowerCase()) ?? [];
    if (groupIds.length > 1) {
      rows.push({
        ...base,
        status: "no_group",
        message: `Several groups in this season are named "${group}". Rename one of them, then import again.`,
        studentUserId: student.userId,
      });
      continue;
    }
    const groupId = groupIds[0];
    if (groupId === undefined) {
      rows.push({
        ...base,
        status: "no_group",
        message: `No group named "${group}" in this season.`,
        studentUserId: student.userId,
      });
      continue;
    }
    if (student.groupId === groupId) {
      rows.push({
        ...base,
        status: "unchanged",
        message: "Already in this group.",
        studentUserId: student.userId,
        groupId,
      });
      continue;
    }
    rows.push({ ...base, status: "assign", message: null, studentUserId: student.userId, groupId });
  }

  const counts = { assign: 0, unchanged: 0, no_student: 0, no_group: 0, invalid: 0, total: rows.length };
  for (const row of rows) counts[row.status] += 1;

  return { rows, delimiter: sheet.delimiter, counts };
}
