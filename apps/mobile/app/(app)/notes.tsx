import { useRouter } from "expo-router";
import { Flag } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { AuthoredNote, NoteVisibility } from "@space/shared";

import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { Badge, Button, Card, CardContent, EmptyState, Text } from "../../src/design/ui";
import { flattenNotePages, useAuthoredNotes } from "../../src/hooks/use-notes";
import { formatDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";

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

/** v1 app/mentor/notes/page.tsx — one card per note: who, when, season, visibility, then the body. */
function NoteRow({ item }: { item: AuthoredNote }) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/student/[id]", params: { id: String(item.student.id) } })
      }
    >
      <Card>
        <CardContent className="flex-col gap-2 pt-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-xs font-medium text-foreground">{item.student.name}</Text>
            <Text className="text-xs text-muted-foreground">·</Text>
            <Text className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</Text>
            {item.seasonTitle ? (
              <>
                <Text className="text-xs text-muted-foreground">·</Text>
                <Text className="text-xs text-muted-foreground">{item.seasonTitle}</Text>
              </>
            ) : null}
            {item.followUpFlagged ? (
              <Badge variant="warning" textClassName="text-[10px]">
                Follow-up flagged
              </Badge>
            ) : null}
          </View>
          <Text className="text-sm">{item.body}</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            {/* Its own node, so the label is findable and read out on its own. */}
            <Badge variant="outline" textClassName="text-[10px]">
              {VISIBILITY_LABEL[item.visibility]}
            </Badge>
            {/* Server-derived (ruling C4): the client never compares timestamps. */}
            {item.edited ? <Text className="text-xs text-muted-foreground">Edited</Text> : null}
          </View>
        </CardContent>
      </Card>
    </Pressable>
  );
}

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

  if (!canAuthor) {
    return (
      <ShellFrame>
        <EmptyState
          icon={Flag}
          title="Notes"
          description="This screen is for staff who write pastoral notes."
        />
      </ShellFrame>
    );
  }

  if (isPending || isError) {
    return (
      <ShellFrame>
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </ShellFrame>
    );
  }

  // Older pages load on demand (R41), so the count is "so far" while more remain.
  const count = `${notes.length}${hasNextPage ? "+" : ""}`;

  return (
    <ShellFrame onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View className="flex-col gap-4">
        <PageTitle
          title="My notes"
          subtitle={`${count} note${notes.length === 1 && !hasNextPage ? "" : "s"} you've authored`}
        />
        {notes.length === 0 ? (
          <EmptyState
            icon={Flag}
            title="No notes yet"
            description="Notes you write about a student appear here. Open a student to write one."
          />
        ) : (
          <View className="flex-col gap-3">
            {notes.map((item) => (
              <NoteRow key={item.id} item={item} />
            ))}
            {hasNextPage ? (
              <Button
                variant="outline"
                className="self-start"
                disabled={isFetchingNextPage}
                onPress={() => void fetchNextPage()}
              >
                Load more
              </Button>
            ) : null}
          </View>
        )}
      </View>
    </ShellFrame>
  );
}
