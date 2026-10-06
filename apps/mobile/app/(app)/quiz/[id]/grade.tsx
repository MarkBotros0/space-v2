import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { QuizAuthoringDetail, QuizGradeSheet, QuizGradingAttempt } from "@space/shared";

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
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../src/ui";

type Edit = { score: string; notes: string };

/** A whole non-negative number from a text field, or null when it is not one. */
function parseMark(value: string): number | null {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function PaperGrid({ id, detail }: { id: number; detail: QuizAuthoringDetail }) {
  const theme = useTheme();
  const sheetQuery = useQuizGradeSheet(id, true);
  const save = useSaveQuizGrades(id);
  // Touched rows only — seeded lazily on first edit, so an untouched row is
  // never re-sent (which would restamp gradedBy/gradedAt on marks this caller
  // never made).
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [error, setError] = useState<string | null>(null);

  if (sheetQuery.isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (sheetQuery.isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load the grade sheet." onRetry={sheetQuery.refetch} />
      </Screen>
    );
  }
  const sheet: QuizGradeSheet = sheetQuery.data;

  const edit = (studentUserId: number, patch: Partial<Edit>) => {
    const row = sheet.rows.find((r) => r.studentUserId === studentUserId);
    setEdits((prev) => ({
      ...prev,
      [studentUserId]: {
        score: prev[studentUserId]?.score ?? (row?.score === null || row === undefined ? "" : String(row.score)),
        notes: prev[studentUserId]?.notes ?? row?.notes ?? "",
        ...patch,
      },
    }));
  };

  const onSave = () => {
    setError(null);
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
      onSuccess: () => setEdits({}),
      onError: (err) => setError(apiErrorMessage(err, "Couldn't save the grades.")),
    });
  };

  const graded = sheet.rows.filter((r) => r.score !== null).length;

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{detail.title}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${graded}/${sheet.studentCount} graded`}
        </Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>{`Out of ${sheet.maxScore}`}</Text>
      </Card>
      {sheet.rows.map((row) => {
        const name = row.studentName ?? "Student";
        const e = edits[row.studentUserId];
        return (
          <Card key={row.studentUserId} style={{ marginBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
            <Text variant="label">{name}</Text>
            <Input
              label={`Score for ${name}`}
              keyboardType="number-pad"
              value={e?.score ?? (row.score === null ? "" : String(row.score))}
              onChangeText={(score) => edit(row.studentUserId, { score })}
            />
            <Input
              label={`Notes for ${name}`}
              value={e?.notes ?? row.notes ?? ""}
              onChangeText={(notes) => edit(row.studentUserId, { notes })}
            />
            {row.gradedByName ? (
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {`Graded by ${row.gradedByName}`}
              </Text>
            ) : null}
          </Card>
        );
      })}
      {error ? (
        <Text variant="label" color={theme.colors.error[500]}>
          {error}
        </Text>
      ) : null}
      <Button title="Save grades" onPress={onSave} loading={save.isPending} />
    </Screen>
  );
}

function AttemptCard({ id, item }: { id: number; item: QuizGradingAttempt }) {
  const theme = useTheme();
  const gradeEssays = useGradeEssays(id);
  const reopen = useReopenAttempt(id);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const essays = item.answers.filter((a) => a.type === "ESSAY");

  const onSaveMarks = () => {
    setError(null);
    // Every essay, always: the server refuses a partial payload
    // (awards_incomplete) rather than silently lowering the total as v1 did.
    const awards: { questionId: number; points: number }[] = [];
    for (const a of essays) {
      const raw = marks[a.questionId] ?? (a.pointsAwarded === null ? "" : String(a.pointsAwarded));
      const points = parseMark(raw);
      if (points === null) {
        setError("Enter a whole-number mark for every essay question.");
        return;
      }
      awards.push({ questionId: a.questionId, points });
    }
    gradeEssays.mutate(
      { attemptId: item.attemptId, awards },
      { onError: (err) => setError(apiErrorMessage(err, "Couldn't save the marks.")) },
    );
  };

  return (
    <Card style={{ marginBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
      <Text variant="heading">{item.studentName ?? "Student"}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {`Attempt ${item.attemptNumber} · ${item.status}`}
      </Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {`Auto ${item.autoScore ?? 0} · Total ${item.totalScore ?? "—"}`}
      </Text>
      {item.gradedByName ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {`Graded by ${item.gradedByName}`}
        </Text>
      ) : null}

      {item.answers.map((a) =>
        a.type === "MCQ" ? (
          <Card key={a.questionId} style={{ gap: theme.spacing.xs }}>
            <Text variant="label">{a.prompt}</Text>
            <Text variant="body">{`Their answer: ${a.selectedIndex !== null ? (a.options[a.selectedIndex] ?? "No answer") : "No answer"}`}</Text>
            {/* The grader sees the key (R103) — the audience it exists for. */}
            {a.correctIndex !== null && a.options[a.correctIndex] !== undefined ? (
              <Text variant="body">{`Correct answer: ${a.options[a.correctIndex]}`}</Text>
            ) : null}
            <Text variant="label">{a.isCorrect ? "Correct" : "Incorrect"}</Text>
          </Card>
        ) : (
          <Card key={a.questionId} style={{ gap: theme.spacing.xs }}>
            <Text variant="label">{a.prompt}</Text>
            {/* Plain text, never markup. */}
            <Text variant="body">{a.text ?? "No answer"}</Text>
            <Input
              label={`Marks for ${a.prompt}`}
              keyboardType="number-pad"
              value={marks[a.questionId] ?? (a.pointsAwarded === null ? "" : String(a.pointsAwarded))}
              onChangeText={(value) => setMarks((prev) => ({ ...prev, [a.questionId]: value }))}
            />
            <Text variant="caption" color={theme.colors.neutral[600]}>{`out of ${a.points}`}</Text>
          </Card>
        ),
      )}

      {error ? (
        <Text variant="label" color={theme.colors.error[500]}>
          {error}
        </Text>
      ) : null}
      {essays.length > 0 ? (
        <Button title="Save marks" onPress={onSaveMarks} loading={gradeEssays.isPending} />
      ) : null}
      {item.status !== "IN_PROGRESS" ? (
        <Button
          title="Reopen for a retake"
          variant="secondary"
          loading={reopen.isPending}
          onPress={() =>
            reopen.mutate(item.studentUserId, {
              onError: (err) => setError(apiErrorMessage(err, "Couldn't reopen the attempt.")),
            })
          }
        />
      ) : null}
    </Card>
  );
}

function WaitingRow({
  id,
  row,
}: {
  id: number;
  row: { studentUserId: number; studentName: string | null; startedAt: string | null };
}) {
  const theme = useTheme();
  const reopen = useReopenAttempt(id);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card style={{ marginBottom: theme.spacing.sm, gap: theme.spacing.xs }}>
      <Text variant="label">{row.studentName ?? "Student"}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {row.startedAt === null ? "Not started" : `In progress since ${formatDate(row.startedAt)}`}
      </Text>
      {error ? (
        <Text variant="label" color={theme.colors.error[500]}>
          {error}
        </Text>
      ) : null}
      {row.startedAt !== null ? (
        <Button
          title="Reopen for a retake"
          variant="secondary"
          loading={reopen.isPending}
          onPress={() =>
            reopen.mutate(row.studentUserId, {
              onError: (err) => setError(apiErrorMessage(err, "Couldn't reopen the attempt.")),
            })
          }
        />
      ) : null}
    </Card>
  );
}

function OnlineGrading({ id, detail }: { id: number; detail: QuizAuthoringDetail }) {
  const theme = useTheme();
  const attempts = useQuizAttempts(id, true);

  if (attempts.isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (attempts.isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load the attempts." onRetry={attempts.refetch} />
      </Screen>
    );
  }
  const page = attempts.data;

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{detail.title}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${page.items.length}/${page.studentCount} submitted`}
        </Text>
      </Card>
      {page.items.map((item) => (
        <AttemptCard key={item.attemptId} id={id} item={item} />
      ))}
      {page.waiting.length > 0 ? (
        <>
          <Text variant="heading">Waiting</Text>
          {page.waiting.map((row) => (
            <WaitingRow key={row.studentUserId} id={id} row={row} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

export default function QuizGradeScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(rawId);
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStaff = role === "LEADER" || role === "ADMIN" || role === "SUPER";
  const detail = useQuizAuthoringDetail(id, isStaff);

  if (!isStaff) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Quizzes" message="This screen isn't available for your role." />
      </Screen>
    );
  }
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That quiz doesn't exist." />
      </Screen>
    );
  }
  if (detail.isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (detail.isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load this quiz." onRetry={detail.refetch} />
      </Screen>
    );
  }
  return detail.data.kind === "PAPER" ? (
    <PaperGrid id={id} detail={detail.data} />
  ) : (
    <OnlineGrading id={id} detail={detail.data} />
  );
}
