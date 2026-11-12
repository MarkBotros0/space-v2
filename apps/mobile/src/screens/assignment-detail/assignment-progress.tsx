/**
 * The leader's progress on one assignment (spec "The leader's side"): one row
 * per student, a chip per part in words, unfinished students first. A row
 * with one essay handed in opens it for review, a row with more opens a list
 * of them. Where the caller may mark (`canMark`: an active season), a row the
 * student hasn't submitted in the app opens "Mark as submitted", or its Undo
 * once marked; the rest are read as one row.
 */
import type { UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { AssignmentPart, AssignmentProgress } from "@space/shared";

import { InlineError } from "../../design/layout/route-states";
import { GroupedList, ListRow, Skeleton, StatusChip, Text } from "../../design/ui";
import { usePrefetchSubmission } from "../../hooks/use-submission";
import { apiErrorStatus } from "../../lib/api-error";
import { plural } from "../../lib/plural";
import { EssayListSheet, type EssayListing } from "./essay-list-sheet";
import { handedInEssays, orderProgress, partChips, progressLine, type ProgressRow } from "./progress-model";
import { StaffMarkSheet } from "./staff-mark-sheet";

const REFUSED = "You don't lead a group in this season, so there's no progress to show.";

/**
 * Whether a press on this row marks or undoes: only where the caller may mark, the student hasn't
 * submitted in the app (their own submission needs no mark) and no handed-in essay is the row's
 * press (a returned essay is dealt with on its review, and returning took any mark away).
 */
function markAction(row: ProgressRow, essays: number, canMark: boolean): "mark" | "undo" | null {
  if (!canMark || row.submittedAt !== null || essays > 0) return null;
  return row.staffMark === null ? "mark" : "undo";
}

const MARK_SPOKEN = { mark: "opens Mark as submitted", undo: "opens Undo" } as const;

function StudentRow({
  parts,
  row,
  canMark,
  onList,
  onMark,
}: {
  parts: AssignmentPart[];
  row: ProgressRow;
  canMark: boolean;
  onList: (listing: EssayListing) => void;
  onMark: (studentUserId: number) => void;
}) {
  const router = useRouter();
  const prefetch = usePrefetchSubmission();
  const chips = partChips(parts, row.parts);
  const name = row.name ?? "Unnamed student";
  const line = progressLine(parts, row);
  const essays = handedInEssays(parts, row);
  const marks = chips.map((c) => c.label).join(", ");
  const single = essays.length === 1 ? essays[0]! : null;
  const action = markAction(row, essays.length, canMark);
  const spoken =
    action !== null
      ? `${marks}, ${MARK_SPOKEN[action]}`
      : essays.length > 1
        ? `${marks}, opens a list of ${plural(essays.length, "essay")}`
        : marks;
  const content = (
    <ListRow
      title={name}
      titleLines={2}
      subtitle={line}
      // Chips under the text, wrapping, so they never squeeze the name at font 1.3.
      footer={chips.map((chip, i) => (
        <StatusChip key={i} {...chip} />
      ))}
      // Honest about what a press does when it opens a list or the mark rather than an essay.
      trailingLabel={spoken}
      chevron={essays.length > 0 || action !== null}
      onPress={
        single !== null
          ? () => router.push({ pathname: "/submission/[publicId]", params: { publicId: single.publicId } })
          : essays.length > 1
            ? () => onList({ name, essays })
            : action !== null
              ? () => onMark(row.studentUserId)
              : undefined
      }
      onPressIn={single !== null ? () => prefetch(single.publicId) : undefined}
    />
  );
  if (essays.length > 0 || action !== null) return content;
  // Not a link: still one row to a screen reader, with every mark.
  return (
    <View accessible accessibilityLabel={`${name}, ${line}, ${marks}`}>
      {content}
    </View>
  );
}

/** The progress block of the staff assignment page, over the caller's `useAssignmentProgress` query. */
export function AssignmentProgressList({
  query: q,
  parts,
  assignmentId,
}: {
  query: UseQueryResult<AssignmentProgress>;
  parts: AssignmentPart[];
  assignmentId: number;
}) {
  // The sheet keeps its last listing while it fades out; `open` alone closes it.
  const [listing, setListing] = useState<EssayListing | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const showList = (next: EssayListing) => {
    setListing(next);
    setListOpen(true);
  };
  // The row being marked, by id: its mark is read from the latest rows, so a refetch reaches the sheet.
  const [marking, setMarking] = useState<number | null>(null);

  if (q.isPending) return <Skeleton className="h-24 w-full rounded-group" />;
  if (q.isError) {
    if (apiErrorStatus(q.error) === 403) {
      return (
        <Text variant="subhead" className="rounded-group bg-surface p-4 text-muted-foreground">
          {REFUSED}
        </Text>
      );
    }
    return <InlineError message="Couldn't load the students' progress." onRetry={() => void q.refetch()} />;
  }

  const rows = q.data.rows;
  if (rows.length === 0) {
    return (
      <Text variant="subhead" className="rounded-group bg-surface p-4 text-muted-foreground">
        No students to show yet.
      </Text>
    );
  }
  const { unfinished, finished } = orderProgress(parts, rows);
  const canMark = q.data.canMark;
  const markRow = marking === null ? undefined : rows.find((r) => r.studentUserId === marking);
  const rowProps = { parts, canMark, onList: showList, onMark: setMarking };
  return (
    <View className="flex-col gap-4">
      <Text variant="subhead" className="text-muted-foreground">
        {`${finished.length} of ${plural(rows.length, "student")} finished`}
      </Text>
      {canMark ? (
        <Text variant="subhead" className="text-muted-foreground">
          Did a student do it outside the app? Tap their name to mark it submitted.
        </Text>
      ) : null}
      {unfinished.length > 0 ? (
        <GroupedList header="Not finished">
          {unfinished.map((row) => (
            <StudentRow key={row.studentUserId} row={row} {...rowProps} />
          ))}
        </GroupedList>
      ) : null}
      {finished.length > 0 ? (
        <GroupedList header="Finished">
          {finished.map((row) => (
            <StudentRow key={row.studentUserId} row={row} {...rowProps} />
          ))}
        </GroupedList>
      ) : null}
      <EssayListSheet open={listOpen} listing={listing} onClose={() => setListOpen(false)} />
      <StaffMarkSheet
        student={markRow ? { userId: markRow.studentUserId, name: markRow.name ?? "Unnamed student" } : null}
        mark={markRow?.staffMark ?? null}
        assignmentId={assignmentId}
        onClose={() => setMarking(null)}
      />
    </View>
  );
}
