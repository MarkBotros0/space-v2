import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PenLine, SearchX } from "lucide-react-native";
import { View } from "react-native";
import type { QuizAuthoringDetail, QuizGradeSheet, QuizGradingAttempt } from "@space/shared";

import { BackLink, Eyebrow, PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { shadowStyle } from "../../../../src/design/lib/shadow";
import { QuizAttemptCard, ReopenButton } from "../../../../src/design/quizzes/quiz-essay-grader";
import { QuizGradeForm } from "../../../../src/design/quizzes/quiz-grade-form";
import { EmptyState, Text } from "../../../../src/design/ui";
import {
  useGradeEssays,
  useQuizAttempts,
  useQuizAuthoringDetail,
  useQuizGradeSheet,
  useReopenAttempt,
  useSaveQuizGrades,
  type GradeEntryInput,
} from "../../../../src/hooks/use-quizzes";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { formatDate } from "../../../../src/lib/format";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useSessionStore } from "../../../../src/store/session";

type Edit = { score: string; notes: string };

/** A whole non-negative number from a text field, or null when it is not one. */
function parseMark(value: string): number | null {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** v1's header: "← Back to session" (when the quiz has one) over the title. */
function Header({ detail, subtitle }: { detail: QuizAuthoringDetail; subtitle?: string }) {
  const router = useRouter();
  const sessionId = detail.sessionId;
  return (
    <View>
      {sessionId !== null ? (
        <BackLink
          icon
          label="Back to session"
          onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(sessionId) } })}
        />
      ) : null}
      <PageTitle title={detail.title} />
      {subtitle ? <Text className="mt-2 text-sm text-muted-foreground">{subtitle}</Text> : null}
    </View>
  );
}

function PaperGrid({ id, detail }: { id: number; detail: QuizAuthoringDetail }) {
  const sheetQuery = useQuizGradeSheet(id, true);
  const save = useSaveQuizGrades(id);
  // Touched rows only — seeded lazily on first edit, so an untouched row is
  // never re-sent (which would restamp gradedBy/gradedAt on marks this caller
  // never made).
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (sheetQuery.isPending) return <RouteSkeleton />;
  if (sheetQuery.isError) return <RouteError onRetry={() => void sheetQuery.refetch()} />;
  const sheet: QuizGradeSheet = sheetQuery.data;

  const rowOf = (studentUserId: number) => sheet.rows.find((r) => r.studentUserId === studentUserId);
  const scoreOf = (studentUserId: number) => {
    const row = rowOf(studentUserId);
    return edits[studentUserId]?.score ?? (row?.score == null ? "" : String(row.score));
  };
  const notesOf = (studentUserId: number) => edits[studentUserId]?.notes ?? rowOf(studentUserId)?.notes ?? "";
  const edit = (studentUserId: number, patch: Partial<Edit>) => {
    setSaved(false);
    setEdits((prev) => ({
      ...prev,
      [studentUserId]: { score: scoreOf(studentUserId), notes: notesOf(studentUserId), ...prev[studentUserId], ...patch },
    }));
  };

  const onSave = () => {
    setError(null);
    setSaved(false);
    const entries: GradeEntryInput[] = [];
    for (const row of sheet.rows) {
      const e = edits[row.studentUserId];
      if (!e) continue;
      // An emptied field is an explicit clear. Anything above max is NOT
      // clamped here: the server is the bound (D7).
      const score = e.score.trim() === "" ? null : parseMark(e.score);
      if (e.score.trim() !== "" && score === null) {
        setError(`Score for ${row.studentName ?? "a student"} must be a whole number.`);
        return;
      }
      entries.push({ studentUserId: row.studentUserId, score, notes: e.notes === "" ? null : e.notes });
    }
    if (entries.length === 0) return;
    save.mutate(entries, {
      onSuccess: () => {
        setEdits({});
        setSaved(true);
      },
      onError: (err) => setError(apiErrorMessage(err, "Couldn't save the grades.")),
    });
  };

  return (
    <>
      <Header
        detail={detail}
        subtitle={`${sheet.sessionTitle ? `${sheet.sessionTitle} · ` : ""}Max score: ${sheet.maxScore}`}
      />
      <QuizGradeForm
        sheet={sheet}
        scoreOf={scoreOf}
        notesOf={notesOf}
        onScore={(sid, score) => edit(sid, { score })}
        onNotes={(sid, notes) => edit(sid, { notes })}
        onSave={onSave}
        pending={save.isPending}
        saved={saved}
        error={error}
      />
    </>
  );
}

function AttemptCard({ id, item, maxScore, hasEssays }: { id: number; item: QuizGradingAttempt; maxScore: number; hasEssays: boolean }) {
  const gradeEssays = useGradeEssays(id);
  const reopen = useReopenAttempt(id);
  const [error, setError] = useState<string | null>(null);
  return (
    <QuizAttemptCard
      attempt={item}
      maxScore={maxScore}
      hasEssays={hasEssays && item.answers.some((a) => a.type === "ESSAY")}
      saving={gradeEssays.isPending}
      reopening={reopen.isPending}
      error={error}
      onSave={(awards) => {
        setError(null);
        gradeEssays.mutate(
          { attemptId: item.attemptId, awards },
          { onError: (err) => setError(apiErrorMessage(err, "Couldn't save the marks.")) },
        );
      }}
      onReopen={() =>
        reopen.mutate(item.studentUserId, {
          onError: (err) => setError(apiErrorMessage(err, "Couldn't reopen the attempt.")),
        })
      }
    />
  );
}

/** V2-ONLY (spec 12 D5/R102): students who haven't finished, drawn as v1 cards. */
function WaitingRow({ id, row }: { id: number; row: { studentUserId: number; studentName: string | null; startedAt: string | null } }) {
  const reopen = useReopenAttempt(id);
  const [error, setError] = useState<string | null>(null);
  return (
    <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
      <Text className="text-sm font-bold text-brand-navy-900 dark:text-foreground">{row.studentName ?? "Student"}</Text>
      <Text className="text-xs text-muted-foreground">
        {row.startedAt === null ? "Not started" : `In progress since ${formatDate(row.startedAt)}`}
      </Text>
      {error ? <Text className="mt-2 text-xs text-error-600">{error}</Text> : null}
      {row.startedAt !== null ? (
        <View className="mt-3 flex-row">
          <ReopenButton
            disabled={reopen.isPending}
            onPress={() =>
              reopen.mutate(row.studentUserId, {
                onError: (err) => setError(apiErrorMessage(err, "Couldn't reopen the attempt.")),
              })
            }
          />
        </View>
      ) : null}
    </View>
  );
}

function OnlineGrading({ id, detail }: { id: number; detail: QuizAuthoringDetail }) {
  const attempts = useQuizAttempts(id, true);

  if (attempts.isPending) return <RouteSkeleton />;
  if (attempts.isError) return <RouteError onRetry={() => void attempts.refetch()} />;
  const page = attempts.data;

  return (
    <>
      <Header detail={detail} />
      {page.items.length === 0 ? (
        <EmptyState title="No submissions yet" description="Student attempts will appear here once they submit this quiz." />
      ) : (
        <View className="flex-col gap-3">
          {page.items.map((item) => (
            <AttemptCard key={item.attemptId} id={id} item={item} maxScore={page.maxScore} hasEssays={page.hasEssays} />
          ))}
        </View>
      )}
      {page.waiting.length > 0 ? (
        <View className="flex-col gap-3">
          <Eyebrow>Waiting</Eyebrow>
          {page.waiting.map((row) => (
            <WaitingRow key={row.studentUserId} id={id} row={row} />
          ))}
        </View>
      ) : null}
    </>
  );
}

/**
 * v1 app/leader/sessions/[id]/quiz/[quizId] and the admin grade page — one
 * screen for every grader (B3-11).
 */
export default function QuizGradeScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(rawId);
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStaff = role === "LEADER" || role === "ADMIN" || role === "SUPER";
  const detail = useQuizAuthoringDetail(id, isStaff);

  let body: ReactNode;
  if (!isStaff) body = <EmptyState icon={PenLine} title="Quizzes" description="This screen isn't available for your role." />;
  else if (id === null) body = <EmptyState icon={SearchX} title="Not found" description="That quiz doesn't exist." />;
  else if (detail.isPending) body = <RouteSkeleton />;
  else if (detail.isError) body = <RouteError onRetry={() => void detail.refetch()} />;
  else
    body =
      detail.data.kind === "PAPER" ? (
        <PaperGrid id={id} detail={detail.data} />
      ) : (
        <OnlineGrading id={id} detail={detail.data} />
      );

  return (
    <ShellFrame>
      <View className="flex-col gap-4">{body}</View>
    </ShellFrame>
  );
}
