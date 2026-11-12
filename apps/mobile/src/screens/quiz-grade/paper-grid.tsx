import { useState } from "react";
import { View } from "react-native";
import type { QuizAuthoringDetail, QuizGradeSheet } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { haptic } from "../../design/motion";
import { Text, toast } from "../../design/ui";
import { LocalStudentList } from "../students-list/local-student-list";
import { StatusChip } from "../../design/ui/status-chip";
import { useQuizGradeSheet, useSaveQuizGrades, type GradeEntryInput } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { unbreakable } from "../../lib/format";
import { parseMark } from "../../lib/parse-mark";
import { PaperGradeSheet, seedDraft, type PaperDraft } from "./paper-grade-sheet";

export function PaperGrid({ id, detail }: { id: number; detail: QuizAuthoringDetail }) {
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
      setError(`Score for ${row.studentName ?? "a student"} must be a number with at most two decimals.`);
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
          <LocalStudentList
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
