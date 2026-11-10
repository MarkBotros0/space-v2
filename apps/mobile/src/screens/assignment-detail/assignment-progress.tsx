/**
 * The leader's progress on one assignment (spec "The leader's side"): one row
 * per student, a chip per part in words, unfinished students first. A row
 * with one essay handed in opens it for review, a row with more opens a list
 * of them; the rest are read as one row.
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

const REFUSED = "You don't lead a group in this season, so there's no progress to show.";

function StudentRow({
  parts,
  row,
  onList,
}: {
  parts: AssignmentPart[];
  row: ProgressRow;
  onList: (listing: EssayListing) => void;
}) {
  const router = useRouter();
  const prefetch = usePrefetchSubmission();
  const chips = partChips(parts, row.parts);
  const name = row.name ?? "Unnamed student";
  const line = progressLine(parts, row);
  const essays = handedInEssays(parts, row);
  const marks = chips.map((c) => c.label).join(", ");
  const single = essays.length === 1 ? essays[0]! : null;
  const content = (
    <ListRow
      title={name}
      titleLines={2}
      subtitle={line}
      // Chips under the text, wrapping, so they never squeeze the name at font 1.3.
      footer={chips.map((chip, i) => (
        <StatusChip key={i} {...chip} />
      ))}
      // Honest about what a press does when it opens a list rather than an essay.
      trailingLabel={essays.length > 1 ? `${marks}, opens a list of ${plural(essays.length, "essay")}` : marks}
      chevron={essays.length > 0}
      onPress={
        single !== null
          ? () => router.push({ pathname: "/submission/[publicId]", params: { publicId: single.publicId } })
          : essays.length > 1
            ? () => onList({ name, essays })
            : undefined
      }
      onPressIn={single !== null ? () => prefetch(single.publicId) : undefined}
    />
  );
  if (essays.length > 0) return content;
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
}: {
  query: UseQueryResult<AssignmentProgress>;
  parts: AssignmentPart[];
}) {
  // The sheet keeps its last listing while it fades out; `open` alone closes it.
  const [listing, setListing] = useState<EssayListing | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const showList = (next: EssayListing) => {
    setListing(next);
    setListOpen(true);
  };

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
  return (
    <View className="flex-col gap-4">
      <Text variant="subhead" className="text-muted-foreground">
        {`${finished.length} of ${plural(rows.length, "student")} finished`}
      </Text>
      {unfinished.length > 0 ? (
        <GroupedList header="Not finished">
          {unfinished.map((row) => (
            <StudentRow key={row.studentUserId} parts={parts} row={row} onList={showList} />
          ))}
        </GroupedList>
      ) : null}
      {finished.length > 0 ? (
        <GroupedList header="Finished">
          {finished.map((row) => (
            <StudentRow key={row.studentUserId} parts={parts} row={row} onList={showList} />
          ))}
        </GroupedList>
      ) : null}
      <EssayListSheet open={listOpen} listing={listing} onClose={() => setListOpen(false)} />
    </View>
  );
}
