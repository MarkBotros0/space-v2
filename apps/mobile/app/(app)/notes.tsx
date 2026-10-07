import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { AuthoredNote, NoteVisibility } from "@space/shared";

import { flattenNotePages, useAuthoredNotes } from "../../src/hooks/use-notes";
import { formatDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/**
 * The truth about the visibility setting, in the words the API enforces.
 *
 * v1's composer said "Who can read this note (in addition to you and admins)",
 * which was simply false: filterVisibleNotes matches the viewer's role against
 * the setting by EQUALITY, so an admin reads none of the LEADERS notes the
 * schema defaults to and none of the MENTORS notes the mentor composer
 * hard-coded (spec R36, D3). Widening the rule to match the old copy would
 * retroactively expose historic notes; fixing the copy does not.
 */
const VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  LEADERS: "Visible to group leaders only",
  MENTORS: "Visible to mentors only",
  ADMINS: "Visible to season admins only",
};

function NoteRow({ item }: { item: AuthoredNote }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/student/[id]", params: { id: String(item.student.id) } })
      }
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.student.name}</Text>
        <Text variant="body">{item.body}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {formatDate(item.createdAt)}
        </Text>
        {/* Its own node, so the label is findable and read out on its own. */}
        <Text variant="label" color={theme.colors.neutral[600]}>
          {VISIBILITY_LABEL[item.visibility]}
        </Text>
        {item.followUpFlagged ? (
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Follow-up flagged
          </Text>
        ) : null}
        {/* Server-derived (ruling C4): the client never compares timestamps. */}
        {item.edited ? (
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Edited
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export default function NotesScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Four roles can author (spec R46–R49); a STUDENT never can (R51) and the
  // API refuses them, so the screen does not ask.
  const canAuthor = role !== null && role !== "STUDENT";
  const { data, isPending, isError, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAuthoredNotes(canAuthor);
  const notes = flattenNotePages(data?.pages);

  const handleRefresh = () => {
    if (canAuthor) void refetch();
  };

  if (!canAuthor) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Notes" message="This screen is for staff who write pastoral notes." />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching}>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load your notes." onRetry={() => void refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          message="Notes you write about a student appear here. Open a student to write one."
        />
      ) : (
        <>
          {notes.map((item) => (
            <NoteRow key={item.id} item={item} />
          ))}
          {hasNextPage ? (
            <Button
              title="Load more"
              variant="ghost"
              loading={isFetchingNextPage}
              onPress={() => void fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
