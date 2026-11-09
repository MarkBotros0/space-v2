import { useLocalSearchParams } from "expo-router";
import { Flag } from "lucide-react-native";
import type { UserRole } from "@space/shared";
import { View } from "react-native";

import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { BACK_TO_PREVIOUS } from "../../../src/design/layout/large-title";
import { Screen } from "../../../src/design/layout/screen";
import { Button, EmptyState, GroupedList } from "../../../src/design/ui";
import { flattenNotePages, useAuthoredNotes } from "../../../src/hooks/use-notes";
import { MentorNotes } from "../../../src/screens/mentor/mentor-notes";
import { NoteRow } from "../../../src/screens/staff-notes/note-row";
import { useSessionStore, useRole } from "../../../src/store/session";

export default function NotesScreen() {
  const role = useRole();
  const { range } = useLocalSearchParams<{ range?: string }>();
  // The mentor reads everyone's notes, not only their own (owner, 2026-11-07).
  if (role === "MENTOR") return <MentorNotes initialRange={range === "week" ? "week" : "all"} />;
  return <AuthoredNotesScreen role={role} />;
}

/** Notes the caller wrote: a leader's, an admin's or a super's My notes. */
function AuthoredNotesScreen({ role }: { role: UserRole | null }) {
  // Four roles can author (spec R46–R49); a STUDENT never can (R51) and the
  // API refuses them, so the screen does not ask.
  // My notes is a tab for the mentor only; for any other role it was opened from More,
  // which the pill does not show, so the screen offers its own Back (R19).
  const isTab = useSessionStore((s) => s.nav()?.tabs.some((t) => t.href === "/notes") ?? false);
  const back = isTab ? undefined : BACK_TO_PREVIOUS;
  const canAuthor = role !== null && role !== "STUDENT";
  const { data, isPending, isError, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAuthoredNotes(canAuthor);
  const notes = flattenNotePages(data?.pages);

  if (!canAuthor) {
    return (
      <Screen back={back}>
        <EmptyState icon={Flag} title="Notes" description="This screen is for staff who write pastoral notes." />
      </Screen>
    );
  }

  if (isPending || isError) {
    return (
      <Screen title="My notes" back={back}>
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </Screen>
    );
  }

  // Older pages load on demand (R41), so the count is "so far" while more remain.
  const count = `${notes.length}${hasNextPage ? "+" : ""}`;

  return (
    <Screen
      title="My notes"
      back={back}
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
            {notes.map((item) => (
              <NoteRow key={item.id} item={item} />
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
