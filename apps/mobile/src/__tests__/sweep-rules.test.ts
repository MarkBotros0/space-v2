/**
 * The UI sweep's rules, held by a test so a screen breaks them in CI rather than on a phone
 * (apps/mobile/CLAUDE.md "Building a screen that passes the sweep" and "Rules from the UI sweep").
 *
 * Strict rules have no offender today and allow none. Ratchet rules froze the offenders that
 * existed when the rule was written (`BASELINE`): a file may not gain one, and a file that drops
 * one must lower its count here, so the list only shrinks.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = [...sources(join(ROOT, "app")), ...sources(join(ROOT, "src"))].map((path) => ({
  label: relative(ROOT, path).split(sep).join("/"),
  lines: readFileSync(path, "utf8").split("\n"),
}));

const hits = (pattern: RegExp, scope: (label: string) => boolean = () => true) =>
  files
    .filter((f) => scope(f.label))
    .flatMap((f) => f.lines.flatMap((line, i) => (pattern.test(line) ? [`${f.label}:${i + 1}  ${line.trim()}`] : [])));

const countsByFile = (found: string[]) =>
  found.reduce<Record<string, number>>((acc, hit) => {
    const file = hit.slice(0, hit.indexOf(":"));
    acc[file] = (acc[file] ?? 0) + 1;
    return acc;
  }, {});

describe("UI sweep rules (strict)", () => {
  it("puts no fixed height on text or an input (min-h-*, never h-*: it clips at font 1.3)", () => {
    expect(hits(/<(Text|Input|TextInput)\b[^>]*className=["{`][^"`}]*?(?<=[\s"'`{])h-(\d|\[)/)).toEqual([]);
  });

  it("takes a screen's bottom padding from useShellBottomPadding(), not a large pb-*", () => {
    const inScreens = (l: string) => l.startsWith("app/") || l.startsWith("src/screens/");
    expect(hits(/(^|[\s"'`])pb-(1[6-9]|[2-9]\d|\d{3,}|\[)/, inScreens)).toEqual([]);
  });

  it("never auto-focuses an input when a screen opens (owner, 2026-11-08)", () => {
    expect(hits(/\bautoFocus\b/)).toEqual([]);
  });

  it("never fades a text token with an alpha (it drops below 4.5:1)", () => {
    expect(hits(/(^|[\s"'`])text-(foreground|muted-foreground|primary|secondary|bad|warn|good|info)\/\d+/)).toEqual([]);
  });
});

/**
 * Offenders when each ratchet rule was written (2026-11-10). Fix one, then lower or remove its
 * entry; never add one.
 */
const BASELINE: Record<string, Record<string, number>> = {
  // A meta line is built with joinMeta() (src/lib/join-meta.ts) or a src/lib/format.ts helper,
  // never by hand with " · " (at 1.3 a hand-built line wraps apart and leaves a dangling dot).
  separators: {
    "app/(app)/(tabs)/community.tsx": 1,
    "app/(app)/(tabs)/follow-ups.tsx": 1,
    "app/(app)/(tabs)/groups.tsx": 1,
    "app/(app)/attendance.tsx": 3,
    "app/(app)/quizzes.tsx": 1,
    "app/(app)/session/[id]/attendance.tsx": 1,
    "app/(app)/session/[id]/edit.tsx": 1,
    "src/design/calendar/season-calendar-agenda.tsx": 1,
    "src/screens/alumni/event-day-list.tsx": 2,
    "src/screens/announcements/meta.ts": 1,
    "src/screens/announcements/poll/poll-results.tsx": 1,
    "src/screens/calendar/calendar-entries.tsx": 1,
    "src/screens/calendar/calendar-list.tsx": 1,
    "src/screens/group-form/members-model.ts": 1,
    "src/screens/group-import/result-step.tsx": 1,
    "src/screens/home/count-tile.tsx": 1,
    "src/screens/home/session-card.tsx": 2,
    "src/screens/leader-groups/index.tsx": 1,
    "src/screens/leader-submissions/index.tsx": 1,
    "src/screens/leader-today/at-risk-reason.ts": 1,
    "src/screens/leader-today/session-section.tsx": 1,
    "src/screens/quiz-detail/leader-quizzes.tsx": 2,
    "src/screens/quiz-detail/quiz-attempt-form.tsx": 1,
    "src/screens/quiz-detail/student-quiz-runner.tsx": 1,
    "src/screens/quiz-edit/quiz-builder.tsx": 1,
    "src/screens/quiz-grade/attempt-sheet.tsx": 1,
    "src/screens/quiz-grade/online-grading.tsx": 1,
    "src/screens/quiz-grade/paper-grid.tsx": 1,
    "src/screens/season/upcoming-section.tsx": 2,
    "src/screens/session-detail/attendance-form.tsx": 1,
    "src/screens/session-detail/quizzes-cards.tsx": 2,
    "src/screens/session-detail/staff-session-bodies.tsx": 2,
    "src/screens/session-detail/student-session-body.tsx": 1,
    "src/screens/staff-notes/note-row.tsx": 1,
    "src/screens/staff-work/index.tsx": 1,
    "src/screens/student-detail/grouped-tabs.tsx": 1,
    "src/screens/students-list/student-filter-sheet.tsx": 1,
    "src/screens/user-import/import-result-step.tsx": 1,
    "src/screens/work/work-model.ts": 3,
  },
  // An empty value says so in words ("Not answered"), never "—".
  emDashEmpty: {
    "src/screens/alumni/alumni-dashboard.tsx": 1,
    "src/screens/announcements/meta.ts": 1,
    "src/screens/quiz-detail/quiz-result-view.tsx": 1,
    "src/screens/quiz-edit/question-row.tsx": 1,
    "src/screens/quiz-grade/quiz-essay-grader.tsx": 1,
    "src/screens/season/group-section.tsx": 1,
    "src/screens/staff-today/super-today.tsx": 1,
  },
  // A count with a unit goes through plural() (the sweep found "1 pts").
  inlinePoints: {
    "app/(app)/quizzes.tsx": 1,
    "src/screens/quiz-detail/leader-quizzes.tsx": 1,
    "src/screens/quiz-detail/quiz-result-view.tsx": 1,
    "src/screens/quiz-edit/quiz-builder.tsx": 1,
    "src/screens/session-detail/quizzes-cards.tsx": 1,
    "src/screens/session-detail/video-sections.tsx": 1,
    "src/screens/video-quiz/video-questions-editor.tsx": 1,
  },
};

describe("UI sweep rules (ratchet)", () => {
  const notHelpers = (l: string) => l !== "src/lib/join-meta.ts" && l !== "src/lib/format.ts";
  const rules: [keyof typeof BASELINE, RegExp, (label: string) => boolean][] = [
    ["separators", /" · "|' · '|\} · \$\{|\} · [A-Za-z]/, notHelpers],
    ["emDashEmpty", /(\?\?|:)\s*["']—["']/, () => true],
    ["inlinePoints", /\}\s?pts\b/, () => true],
  ];

  it.each(rules)("%s: no file gains an offender, and fixed ones come off the baseline", (name, pattern, scope) => {
    expect(countsByFile(hits(pattern, scope))).toEqual(BASELINE[name]);
  });
});
