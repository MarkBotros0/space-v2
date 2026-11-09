import { useState, type ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";
import { View } from "react-native";
import type { QuizAuthoringDetail, QuizGradeSheet } from "@space/shared";

import { NAV_ICONS } from "../../../../src/design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { haptic } from "../../../../src/design/motion";
import { Button, EmptyState, Text, toast } from "../../../../src/design/ui";
import { StudentList } from "../../../../src/design/students/student-list";
import { GroupedList, ListRow } from "../../../../src/design/ui/grouped-list";
import { StatusChip, statusChip } from "../../../../src/design/ui/status-chip";
import {
  flattenGradingPages,
  useQuizAttempts,
  useQuizAuthoringDetail,
  useQuizGradeSheet,
  useSaveQuizGrades,
  type GradeEntryInput,
} from "../../../../src/hooks/use-quizzes";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { formatDate, unbreakable } from "../../../../src/lib/format";
import { parseMark } from "../../../../src/lib/parse-mark";
import { parsePositiveInt } from "../../../../src/lib/params";
import { AttemptSheet } from "../../../../src/screens/quiz-grade/attempt-sheet";
import { ReleaseResultsCard } from "../../../../src/screens/quiz-grade/release-results";
import { PaperGradeSheet, seedDraft, type PaperDraft } from "../../../../src/screens/quiz-grade/paper-grade-sheet";
import { useSessionStore } from "../../../../src/store/session";

function PaperGrid({ id, detail }: { id: number; detail: QuizAuthoringDetail }) {
  const sheetQuery = useQuizGradeSheet(id, true);
  const save = useSaveQuizGrades(id);
  // Touched rows only — seeded lazily on first edit, so an untouched row is
  // never re-sent (which would restamp gradedBy/gradedAt on marks this caller
  // never made). Cleared per student when that student's save lands.
  const [drafts, setDrafts] = useState<Record<number, PaperDraft>>({});
  // The row the sheet shows; it stays set while the sheet animates out.
  const [shown, setShown] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheet: QuizGradeSheet | undefined = sheetQuery.data;
  const row = sheet?.rows.find((r) => r.studentUserId === shown);
  const graded = sheet ? sheet.rows.filter((r) => r.score != null).length : 0;
  const subtitle = sheet
    ? `${sheet.sessionTitle ? `${sheet.sessionTitle} · ` : ""}Max score: ${sheet.maxScore} · ${unbreakable(`${graded} / ${sheet.rows.length} graded`)}`
    : undefined;

  const draftOf = (r: NonNullable<typeof row>): PaperDraft => drafts[r.studentUserId] ?? seedDraft(r);

  const onSave = () => {
    if (!row) return;
    setError(null);
    // Nothing typed (absent, or equal to what the server sent): close without
    // a request, or the seed would restamp a co-leader's mark as this caller's.
    const typed = drafts[row.studentUserId];
    const seed = seedDraft(row);
    if (!typed || (typed.score === seed.score && typed.notes === seed.notes)) {
      setOpen(false);
      return;
    }
    const d = typed;
    // An emptied field is an explicit clear. Anything above max is NOT
    // clamped here: the server is the bound (D7).
    const score = d.score.trim() === "" ? null : parseMark(d.score);
    if (d.score.trim() !== "" && score === null) {
      setError(`Score for ${row.studentName ?? "a student"} must be a whole number.`);
      return;
    }
    const entry: GradeEntryInput = {
      studentUserId: row.studentUserId,
      score,
      notes: d.notes === "" ? null : d.notes,
    };
    save.mutate([entry], {
      onSuccess: () => {
        setDrafts((prev) => {
          const { [row.studentUserId]: _done, ...rest } = prev;
          return rest;
        });
        haptic("light");
        toast.success("Saved.");
        setOpen(false);
      },
      onError: (err) => setError(apiErrorMessage(err, "Couldn't save the grades.")),
    });
  };

  return (
    <Screen
      title={detail.title}
      subtitle={subtitle}
      refreshing={sheetQuery.isRefetching}
      onRefresh={() => void sheetQuery.refetch()}
    >
      {sheetQuery.isPending ? (
        <RouteSkeleton />
      ) : sheetQuery.isError || !sheet ? (
        <RouteError onRetry={() => void sheetQuery.refetch()} />
      ) : (
        // Search, a page at a time, and a header per group (owner, 2026-11-07).
        <View className="flex-col gap-4">
          <ReleaseResultsCard quiz={detail} />
          <StudentList
            items={sheet.rows.map((r) => ({
              id: r.studentUserId,
              name: r.studentName ?? "Student",
              group: r.groupName,
              subtitle: r.notes ?? undefined,
              row: r,
            }))}
            trailing={({ row: r }) =>
              r.score == null ? (
                <StatusChip tone="neutral" label="Not graded" />
              ) : (
                <Text variant="body" tabular className="text-foreground">
                  {unbreakable(`${r.score} / ${sheet.maxScore}`)}
                </Text>
              )
            }
            trailingLabel={({ row: r }) => (r.score == null ? "Not graded" : `${r.score} of ${sheet.maxScore}`)}
            onPress={({ row: r }) => {
              setError(null);
              setShown(r.studentUserId);
              setOpen(true);
            }}
          />
        </View>
      )}
      {sheet && row ? (
        <PaperGradeSheet
          row={row}
          maxScore={sheet.maxScore}
          open={open}
          onClose={() => setOpen(false)}
          draft={draftOf(row)}
          onDraft={(patch) =>
            setDrafts((prev) => ({
              ...prev,
              [row.studentUserId]: { ...(prev[row.studentUserId] ?? seedDraft(row)), ...patch },
            }))
          }
          onSave={onSave}
          saving={save.isPending}
          error={error}
        />
      ) : null}
    </Screen>
  );
}

function OnlineGrading({ id, detail }: { id: number; detail: QuizAuthoringDetail }) {
  const attempts = useQuizAttempts(id, true);
  const [shown, setShown] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const first = attempts.data?.pages[0];
  let body: ReactNode;
  let sheet: ReactNode = null;
  if (attempts.isPending) body = <RouteSkeleton />;
  else if (attempts.isError || !first) body = <RouteError onRetry={() => void attempts.refetch()} />;
  else {
    // The server pages over students, 20 at a time; both lists grow per page.
    const { items, waiting } = flattenGradingPages(attempts.data.pages);
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = attempts;
    const attempt = items.find((a) => a.attemptId === shown);
    if (attempt)
      sheet = (
        <AttemptSheet
          key={attempt.attemptId}
          quizId={id}
          attempt={attempt}
          maxScore={first.maxScore}
          hasEssays={first.hasEssays}
          open={open}
          onClose={() => setOpen(false)}
        />
      );
    body = (
      <View className="flex-col gap-4">
        <ReleaseResultsCard quiz={detail} />
        {items.length === 0 ? (
          hasNextPage ? null : (
            <EmptyState
              title="No submissions yet"
              description="Student attempts will appear here once they submit this quiz."
            />
          )
        ) : (
          <GroupedList>
            {items.map((a) => (
              <ListRow
                key={a.attemptId}
                title={a.studentName ?? "Student"}
                titleLines={2}
                subtitle={`Attempt ${a.attemptNumber} · ${a.status === "GRADED" ? `${a.totalScore ?? 0}/${first.maxScore}` : "Awaiting grading"} · ${unbreakable(formatDate(a.submittedAt))}`}
                trailing={<StatusChip {...statusChip("quizAttempt", a.status)} />}
                chevron
                onPress={() => {
                  setShown(a.attemptId);
                  setOpen(true);
                }}
              />
            ))}
          </GroupedList>
        )}
        {waiting.length > 0 ? (
          /**
           * V2-ONLY (spec 12 D5/R102): students who haven't finished.
           *
           * No Reopen here, and no press at all. A waiting student either never
           * started (the server answers 409 `no_attempt`) or has an attempt still
           * IN_PROGRESS (409 `attempt_open`) — they can simply resume it — so the
           * button could only ever fail.
           */
          <GroupedList header="Waiting">
            {waiting.map((w) => (
              <ListRow
                key={w.studentUserId}
                title={w.studentName ?? "Student"}
                titleLines={2}
                subtitle={
                  w.startedAt === null ? "Not started" : `In progress since ${unbreakable(formatDate(w.startedAt))}`
                }
              />
            ))}
          </GroupedList>
        ) : null}
        {hasNextPage ? (
          <Button
            variant="secondary"
            className="self-center"
            disabled={isFetchingNextPage}
            onPress={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </View>
    );
  }

  return (
    <Screen
      title={detail.title}
      subtitle={`Max score: ${detail.maxScore}`}
      refreshing={attempts.isRefetching && !attempts.isFetchingNextPage}
      onRefresh={() => void attempts.refetch()}
    >
      {body}
      {sheet}
    </Screen>
  );
}

/**
 * v1 app/leader/sessions/[id]/quiz/[quizId] and the admin grade page — one
 * screen for every grader (B3-11): LEADER, ADMIN and SUPER.
 */
export default function QuizGradeScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(rawId);
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStaff = role === "LEADER" || role === "ADMIN" || role === "SUPER";
  const detail = useQuizAuthoringDetail(id, isStaff);

  if (isStaff && id !== null && detail.data) {
    return detail.data.kind === "PAPER" ? (
      <PaperGrid id={id} detail={detail.data} />
    ) : (
      <OnlineGrading id={id} detail={detail.data} />
    );
  }

  let body: ReactNode;
  if (!isStaff)
    body = (
      <EmptyState icon={NAV_ICONS.quizzes} title="Quizzes" description="This screen isn't available for your role." />
    );
  else if (id === null) body = <EmptyState icon={SearchX} title="Not found" description="That quiz doesn't exist." />;
  else if (detail.isError) body = <RouteError onRetry={() => void detail.refetch()} />;
  else body = <RouteSkeleton />;
  return <Screen title="Quiz">{body}</Screen>;
}
