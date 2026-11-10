/**
 * Renders docs/database/erd.md from prisma/schema.prisma: one Mermaid diagram
 * per domain, then the SQL-only objects (CHECKs, partial indexes) that the
 * schema lists as `// SQL-only <kind> <name>: <definition>`.
 *
 * Pure: schema text in, Markdown out. `pnpm db:erd` writes the file, and
 * src/__tests__/erd.test.ts fails when the committed file is stale.
 */

/** Each model's home domain. A model missing here makes renderErd throw. */
const DOMAINS: { title: string; models: string[] }[] = [
  {
    title: "Identity & auth",
    models: [
      "User",
      "InviteToken",
      "RefreshToken",
      "PasswordResetToken",
      "StudentProfile",
      "NotificationPreference",
      "DeviceToken",
      "RateLimitHit",
    ],
  },
  {
    title: "Seasons, groups & enrolment",
    models: ["Season", "SeasonAdmin", "Group", "GroupLeader", "GroupStudent", "SeasonEnrollment"],
  },
  {
    title: "Sessions, attendance & video",
    models: ["Session", "Attendance", "SessionVideoQuestion", "SessionVideoQuestionResponse", "SessionVideoProgress"],
  },
  {
    title: "Assignments & submissions",
    models: ["Assignment", "AssignmentTarget", "Submission", "SubmissionFile", "ForumComment"],
  },
  { title: "Quizzes", models: ["Quiz", "QuizGrade", "QuizQuestion", "QuizAttempt", "QuizAnswer"] },
  {
    title: "Notes, follow-ups, notifications, announcements, events",
    models: ["EngagementNote", "MentorFollowUp", "Notification", "JpcEvent", "Announcement", "AnnouncementRead"],
  },
  { title: "Announcement polls", models: ["AnnouncementPoll", "AnnouncementPollOption", "AnnouncementPollVote"] },
];

interface Field {
  name: string;
  type: string;
  list: boolean;
  optional: boolean;
  attrs: string;
}

interface Model {
  name: string;
  fields: Field[];
  /** Field sets that are unique on their own: @id, @unique, @@id, @@unique. */
  uniques: string[][];
  /** @id fields or the @@id set. */
  pk: string[];
  sqlOnly: { kind: string; name: string; definition: string }[];
}

interface Edge {
  parent: string;
  child: string;
  label: string;
  fields: string[];
}

const listOf = (inner: string): string[] =>
  inner
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

function parseLine(model: Model, line: string): void {
  const sql = /^\/\/ SQL-only (CHECK|UNIQUE INDEX|INDEX) (\w+): (.*)$/.exec(line);
  if (sql) model.sqlOnly.push({ kind: sql[1]!, name: sql[2]!, definition: sql[3]! });
  const block = /^@@(id|unique)\(\[([^\]]*)\]/.exec(line);
  if (block) {
    const set = listOf(block[2]!);
    model.uniques.push(set);
    if (block[1] === "id") model.pk = set;
  }
  const field = /^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(line);
  if (!field || line.startsWith("//") || line.startsWith("@@")) return;
  const attrs = field[5]!.replace(/\s\/\/.*$/, "");
  const f: Field = { name: field[1]!, type: field[2]!, list: !!field[3], optional: !!field[4], attrs };
  model.fields.push(f);
  if (/@id\b/.test(attrs)) {
    model.pk = [f.name];
    model.uniques.push([f.name]);
  }
  if (/@unique\b/.test(attrs)) model.uniques.push([f.name]);
}

function parseModels(schema: string): Model[] {
  return [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)].map(([, name, body]) => {
    const model: Model = { name: name!, fields: [], uniques: [], pk: [], sqlOnly: [] };
    for (const raw of body!.split("\n")) parseLine(model, raw.trim());
    return model;
  });
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

function edgesOf(models: Model[]): Edge[] {
  const names = new Set(models.map((m) => m.name));
  const edges: Edge[] = [];
  for (const m of models) {
    for (const f of m.fields) {
      const fk = /@relation\([^)]*fields:\s*\[([^\]]*)\]/.exec(f.attrs);
      if (!names.has(f.type) || !fk) continue;
      edges.push({ parent: f.type, child: m.name, label: f.name, fields: listOf(fk[1]!) });
    }
  }
  return edges;
}

function cardinality(edge: Edge, child: Model): string {
  const fkFields = child.fields.filter((f) => edge.fields.includes(f.name));
  const left = fkFields.some((f) => f.optional) ? "|o" : "||";
  const right = child.uniques.some((u) => sameSet(u, edge.fields)) ? "o|" : "o{";
  return `${left}--${right}`;
}

function entity(m: Model, fkNames: Set<string>, full: boolean): string[] {
  if (!full) return [`  ${m.name} {`, `    Int id PK`, `  }`];
  const lines = [`  ${m.name} {`];
  const modelNames = new Set(DOMAINS.flatMap((d) => d.models));
  for (const f of m.fields) {
    if (modelNames.has(f.type)) continue; // a relation field, drawn as an edge
    const keys = [
      m.pk.includes(f.name) ? "PK" : null,
      fkNames.has(f.name) ? "FK" : null,
      /@unique\b/.test(f.attrs) ? "UK" : null,
    ].filter(Boolean);
    const type = f.list ? `${f.type}_arr` : f.type;
    const note = f.optional ? ` "nullable"` : "";
    lines.push(`    ${type} ${f.name}${keys.length ? ` ${keys.join(", ")}` : ""}${note}`);
  }
  lines.push(`  }`);
  return lines;
}

function renderDomain(
  domain: { title: string; models: string[] },
  n: number,
  edges: Edge[],
  byName: Map<string, Model>,
): string[] {
  const own = new Set(domain.models);
  const mine = edges.filter((e) => own.has(e.child));
  const stubs = [...new Set(mine.map((e) => e.parent).filter((p) => !own.has(p)))].sort();
  const out = ["", `## ${n}. ${domain.title}`, "", "```mermaid", "erDiagram"];
  for (const e of mine) out.push(`  ${e.parent} ${cardinality(e, byName.get(e.child)!)} ${e.child} : "${e.label}"`);
  for (const name of domain.models) {
    const fks = new Set(mine.filter((e) => e.child === name).flatMap((e) => e.fields));
    out.push(...entity(byName.get(name)!, fks, true));
  }
  for (const name of stubs) out.push(...entity(byName.get(name)!, new Set(), false));
  out.push("```");
  return out;
}

export function renderErd(schema: string): string {
  const models = parseModels(schema);
  const byName = new Map(models.map((m) => [m.name, m]));
  const homed = DOMAINS.flatMap((d) => d.models);
  const homeless = models.filter((m) => !homed.includes(m.name)).map((m) => m.name);
  const gone = homed.filter((n) => !byName.has(n));
  if (homeless.length || gone.length) {
    throw new Error(
      `scripts/erd/render.ts DOMAINS is out of date: no domain for [${homeless.join(", ")}], ` +
        `no model for [${gone.join(", ")}]`,
    );
  }
  const edges = edgesOf(models);

  const out: string[] = [
    "# Database ERD",
    "",
    "Generated from `apps/backend/prisma/schema.prisma` by `pnpm --filter @space/backend db:erd`; do not edit by",
    "hand. A unit test (`src/__tests__/erd.test.ts`) fails when this file is stale.",
    "",
    "Each diagram draws one domain's tables in full. Tables from another domain appear as `id`-only stubs.",
    "Cardinality: `||--o{` required parent, `|o--o{` nullable FK, `--o|` one-to-one (the FK is unique).",
    "Types ending in `_arr` are arrays.",
  ];
  DOMAINS.forEach((domain, i) => out.push(...renderDomain(domain, i + 1, edges, byName)));

  out.push(
    "",
    "## SQL-only objects",
    "",
    "Rules Prisma cannot declare. They live in `prisma/migrations` and are noted on their model in",
    "`schema.prisma`; `schema-snapshot.test.ts` fails if the database has one that is not noted. Never run",
    "`prisma migrate dev` against a migrated database: it would drop them.",
    "",
    "| Table | Kind | Name | Definition |",
    "|---|---|---|---|",
  );
  const sorted = [...models].sort((a, b) => a.name.localeCompare(b.name));
  const rows = sorted.flatMap((m) => m.sqlOnly.map((o) => ({ table: m.name, ...o })));
  for (const o of rows) {
    out.push(`| ${o.table} | ${o.kind} | \`${o.name}\` | \`${o.definition.replace(/\|/g, "\\|")}\` |`);
  }
  return `${out.join("\n")}\n`;
}
