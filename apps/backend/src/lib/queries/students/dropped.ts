import type { StudentListQuery } from "@space/shared";
import { db } from "../../../db/client";
import type { Prisma } from "../../../generated/prisma/client";
import type { SessionUser } from "../../auth/tokens";
import { isSuper } from "../../rbac";
import { liveUser } from "../../db/live";
import { emptyList, searchFilter, listSelect, toListItem, type StudentListResult } from "./list-row";

/**
 * The dropped list is a list of ENROLLMENTS, not students (R43): its row key
 * is the enrollment id and a student dropped from three seasons appears three
 * times. SUPER and ADMIN only — v1's gate also admitted MENTOR but no mentor
 * page ever called it; as an endpoint that would hand every drop reason in
 * the database to read-all (spec 06 §4.3), so the surface narrows (§7).
 */
export async function listDroppedEnrollments(
  user: SessionUser,
  query: StudentListQuery,
): Promise<StudentListResult | null> {
  if (!isSuper(user) && user.role !== "ADMIN") return null;
  if (user.role === "ADMIN" && user.seasonAdminIds.length === 0) return emptyList();

  const where: Prisma.SeasonEnrollmentWhereInput = {
    AND: [
      { status: "WITHDRAWN" },
      // D12: v1 filtered neither deletedAt nor role here, so a soft-deleted
      // student's name, email and drop reason stayed listed forever, with a
      // click-through that 404s.
      { studentUser: { role: "STUDENT", ...liveUser, ...searchFilter(query.q) } },
      ...(user.role === "ADMIN" ? [{ seasonId: { in: user.seasonAdminIds } }] : []),
      ...(query.seasonId ? [{ seasonId: query.seasonId }] : []),
    ],
  };

  const [rows, total] = await Promise.all([
    db.seasonEnrollment.findMany({
      where,
      orderBy: [{ droppedAt: "desc" }, { id: "desc" }], // R46
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        seasonId: true,
        droppedAt: true,
        dropReason: true,
        season: { select: { title: true } },
        studentUser: { select: listSelect(user) },
      },
    }),
    db.seasonEnrollment.count({ where }),
  ]);

  const page = rows.slice(0, query.limit);
  return {
    students: page.map((r) => ({
      ...toListItem(r.studentUser),
      droppedEnrollment: {
        enrollmentId: r.id,
        seasonId: r.seasonId,
        seasonTitle: r.season.title,
        // Nullable on the contract: only dropEnrollment sets it today, but
        // nothing in the schema guarantees that (spec 06 §2's warning about
        // v1's non-null assertion at students-query.ts:196).
        droppedAt: r.droppedAt?.toISOString() ?? null,
        dropReason: r.dropReason,
      },
    })),
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    total,
  };
}
