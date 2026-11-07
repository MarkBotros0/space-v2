import { useEffect, useState } from "react";
import { Flag } from "lucide-react-native";
import { View } from "react-native";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button, EmptyState, GroupedList, SegmentedControl } from "../../design/ui";
import { flattenNotePages, useVisibleNotePages } from "../../hooks/use-notes";
import { NoteRow } from "../staff-notes/note-row";

type Range = "all" | "week";
const WEEK_DAYS = 7;

/**
 * The mentor's Notes tab (owner, 2026-11-07): every note they may read, about any
 * student, by anyone: the student, the author, the date and the body. All or
 * This week (the last 7 days, Home's "Notes this week" opens it). Writing a note
 * stays on the student's page.
 */
export function MentorNotes({ initialRange }: { initialRange: Range }) {
  const [range, setRange] = useState<Range>(initialRange);
  useEffect(() => setRange(initialRange), [initialRange]);
  const notesQuery = useVisibleNotePages(range === "week" ? WEEK_DAYS : null, true);
  const { data, isPending, isError, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    notesQuery;
  const notes = flattenNotePages(data?.pages);

  let body;
  if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else if (notes.length === 0)
    body = (
      <EmptyState
        icon={Flag}
        title={range === "week" ? "No notes this week" : "No notes yet"}
        description="Notes written about members appear here. Open a member to write one."
      />
    );
  else
    body = (
      <View className="flex-col gap-4">
        <GroupedList>
          {notes.map((item) => (
            <NoteRow key={item.id} item={item} byAuthor />
          ))}
        </GroupedList>
        {hasNextPage ? (
          <Button
            variant="secondary"
            className="self-center"
            disabled={isFetchingNextPage}
            onPress={() => void fetchNextPage()}
          >
            Load more
          </Button>
        ) : null}
      </View>
    );

  return (
    <Screen title="Notes" onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View className="flex-col gap-4">
        <SegmentedControl
          options={[
            { value: "all", label: "All" },
            { value: "week", label: "This week" },
          ]}
          value={range}
          onChange={(v) => setRange(v === "week" ? "week" : "all")}
        />
        {body}
      </View>
    </Screen>
  );
}
