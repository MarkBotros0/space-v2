import { Flag } from "lucide-react-native";
import { View } from "react-native";

import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { Button, EmptyState, GroupedList } from "../../../src/design/ui";
import { flattenNotePages, useAuthoredNotes } from "../../../src/hooks/use-notes";
import { NoteRow } from "../../../src/screens/staff-notes/note-row";
import { useSessionStore } from "../../../src/store/session";

export default function NotesScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Four roles can author (spec R46–R49); a STUDENT never can (R51) and the
  // API refuses them, so the screen does not ask.
  const canAuthor = role !== null && role !== "STUDENT";
  const {
    data,
    isPending,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAuthoredNotes(canAuthor);
  const notes = flattenNotePages(data?.pages);

  // One list serves every authoring role, the mentor included (R05-4), so there
  // is no `role === "MENTOR"` return here.
  if (!canAuthor) {
    return (
      <Screen>
        <EmptyState
          icon={Flag}
          title="Notes"
          description="This screen is for staff who write pastoral notes."
        />
      </Screen>
    );
  }

  if (isPending || isError) {
    return (
      <Screen title="My notes">
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </Screen>
    );
  }

  // Older pages load on demand (R41), so the count is "so far" while more remain.
  const count = `${notes.length}${hasNextPage ? "+" : ""}`;

  return (
    <Screen
      title="My notes"
      subtitle={`${count} note${notes.length === 1 && !hasNextPage ? "" : "s"} you've authored`}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {notes.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No notes yet"
          description="Notes you write about a student appear here. Open a student to write one."
        />
      ) : (
        <View className="flex-col gap-4">
          <GroupedList>
            {notes.map((item, i) => (
              <NoteRow key={item.id} item={item} index={i} />
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
      )}
    </Screen>
  );
}
