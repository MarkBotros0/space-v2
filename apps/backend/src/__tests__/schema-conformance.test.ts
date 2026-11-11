/**
 * Schema conformance (refactor Wave 7, Q4 / Q5 / DB-008): the conventions in schema.prisma's
 * header, held for every model so a new table or foreign key has to choose a rule instead of
 * drifting. Reads the schema file only; no database.
 *
 * 1. Base columns: every model has `createdAt` and `updatedAt`, unless it is listed below as
 *    append-only (no `updatedAt`) or as a link / event row with neither.
 * 2. Every foreign key has an index leading with its first column, except the audit trail to
 *    User and the small tables DB-008 chose not to index (listed with the reason).
 * 3. Link tables are keyed by their pair: a model made of foreign keys and timestamps has a
 *    composite `@@id` of those keys, and every composite `@@id` is made of foreign-key columns.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

interface Field {
  name: string;
  type: string;
  attrs: string;
}
interface Model {
  name: string;
  fields: Field[];
  blocks: string[];
}

const schema = readFileSync(path.join(__dirname, "../../prisma/schema.prisma"), "utf8");

function parseModels(text: string): Model[] {
  return [...text.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)].map(([, name = "", body = ""]) => {
    const lines = body
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .filter(Boolean);
    const fields = lines
      .filter((l) => !l.startsWith("@@"))
      .map((l) => {
        const [fieldName = "", type = "", ...rest] = l.split(/\s+/);
        return { name: fieldName, type, attrs: rest.join(" ") };
      });
    return { name, fields, blocks: lines.filter((l) => l.startsWith("@@")) };
  });
}

const columnsOf = (list: string) => list.split(",").map((c) => c.trim().replace(/\(.*$/, ""));
const foreignKeys = (m: Model) =>
  m.fields.flatMap((f) => {
    const match = /@relation\([^)]*fields:\s*\[([^\]]*)\]/.exec(f.attrs);
    return match?.[1] ? [columnsOf(match[1])] : [];
  });
const indexes = (m: Model) => [
  ...m.blocks.flatMap((b) => {
    const match = /^@@(?:id|index|unique)\(\[([^\]]*)\]/.exec(b);
    return match?.[1] ? [columnsOf(match[1])] : [];
  }),
  ...m.fields.filter((f) => /@id\b|@unique\b/.test(f.attrs)).map((f) => [f.name]),
];
const compositeId = (m: Model) => {
  const block = m.blocks.find((b) => b.startsWith("@@id("));
  return block ? columnsOf(/\[([^\]]*)\]/.exec(block)?.[1] ?? "") : null;
};
const scalarFields = (m: Model, all: Set<string>) =>
  m.fields.filter((f) => !all.has(f.type.replace(/[?[\]]/g, "")) && !f.type.endsWith("[]"));

const models = parseModels(schema);
const modelNames = new Set(models.map((m) => m.name));

/** Rows written once and never updated (tokens, notifications, votes): createdAt only. */
const APPEND_ONLY = new Set([
  "InviteToken",
  "RefreshToken",
  "PasswordResetToken",
  "Notification",
  "DeviceToken",
  "AnnouncementPollVote",
]);
/** Pure links and event rows that carry their own moment (assignedAt, answeredAt, uploadedAt, readAt). */
const NO_BASE_TIMESTAMPS = new Set([
  "SeasonAdmin",
  "GroupLeader",
  "GroupStudent",
  "SessionVideoQuestionResponse",
  "SubmissionFile",
  "RateLimitHit",
  "AnnouncementRead",
]);

/**
 * DB-008: foreign keys left unindexed on purpose. The audit trail to User (who created, marked,
 * reviewed, graded, closed): users are never hard-deleted and nothing filters on these. If hard
 * user deletion (erasure) is ever added, index them first.
 */
const AUDIT_FKS = new Set([
  "User.graduationOverrideById",
  "InviteToken.invitedById",
  "Season.createdById",
  "Season.updatedById",
  "SeasonAdmin.assignedById",
  "SeasonEnrollment.overrideById",
  "SessionVideoQuestion.createdById",
  "Attendance.markedById",
  "Assignment.createdById",
  "Assignment.updatedById",
  "Quiz.createdById",
  "Quiz.resultsReleasedById",
  "QuizGrade.gradedById",
  "QuizAttempt.gradedById",
  "QuizAttempt.endedById",
  "JpcEvent.createdById",
  "Announcement.authorId",
  "AnnouncementPoll.closedById",
]);
/** DB-008 / §2.11: small tables, read by their other key; an index would cost more than it saves. */
const SMALL_UNFILTERED_FKS = new Set([
  "SessionVideoProgress.studentUserId",
  "MentorFollowUp.studentUserId",
  "EngagementNote.seasonId",
  "JpcEvent.seasonId",
  "AnnouncementPollVote.userId",
]);

describe("schema conformance", () => {
  it("parses every model", () => {
    expect(models.length).toBeGreaterThan(30);
    for (const m of models) expect(m.fields.length).toBeGreaterThan(0);
  });

  it("lists only real models and real foreign keys as exceptions", () => {
    for (const name of [...APPEND_ONLY, ...NO_BASE_TIMESTAMPS]) expect(modelNames).toContain(name);
    const allFks = new Set(models.flatMap((m) => foreignKeys(m).map((fk) => `${m.name}.${fk[0]}`)));
    for (const fk of [...AUDIT_FKS, ...SMALL_UNFILTERED_FKS]) expect(allFks).toContain(fk);
  });

  it("gives every model createdAt and updatedAt, unless it is listed as append-only or a link", () => {
    const wrong = models.flatMap((m) => {
      const has = (n: string) => m.fields.some((f) => f.name === n);
      const want = NO_BASE_TIMESTAMPS.has(m.name)
        ? { createdAt: false, updatedAt: false }
        : { createdAt: true, updatedAt: !APPEND_ONLY.has(m.name) };
      return (["createdAt", "updatedAt"] as const)
        .filter((col) => has(col) !== want[col])
        .map((col) => `${m.name}.${col} ${want[col] ? "missing" : "present but the model is listed without it"}`);
    });
    expect(wrong).toEqual([]);
  });

  it("indexes every foreign key by its leading column, except the documented ones", () => {
    const unindexed = models.flatMap((m) =>
      foreignKeys(m)
        .filter((fk) => !indexes(m).some((ix) => ix[0] === fk[0]))
        .map((fk) => `${m.name}.${fk[0]}`)
        .filter((key) => !AUDIT_FKS.has(key) && !SMALL_UNFILTERED_FKS.has(key)),
    );
    expect(unindexed).toEqual([]);
  });

  it("does not list an indexed foreign key as unindexed", () => {
    const stale = models.flatMap((m) =>
      foreignKeys(m)
        .filter((fk) => indexes(m).some((ix) => ix[0] === fk[0]))
        .map((fk) => `${m.name}.${fk[0]}`)
        .filter((key) => AUDIT_FKS.has(key) || SMALL_UNFILTERED_FKS.has(key)),
    );
    expect(stale).toEqual([]);
  });

  it("keys every composite primary key by foreign-key columns", () => {
    const wrong = models.flatMap((m) => {
      const pk = compositeId(m);
      if (!pk) return [];
      const fkColumns = new Set(foreignKeys(m).flat());
      return pk.filter((c) => !fkColumns.has(c)).map((c) => `${m.name}.${c}`);
    });
    expect(wrong).toEqual([]);
  });

  it("keys a link table (only foreign keys and timestamps) by its pair, not a surrogate id", () => {
    const wrong = models.filter((m) => {
      const fkColumns = new Set(foreignKeys(m).flat());
      const scalars = scalarFields(m, modelNames);
      const linkShaped =
        fkColumns.size >= 2 && scalars.every((f) => fkColumns.has(f.name) || f.type.startsWith("DateTime"));
      return linkShaped && !compositeId(m);
    });
    expect(wrong.map((m) => m.name)).toEqual([]);
  });
});
