/** student-detail's Notes tab: the add-a-note form and the paged note list. */
import type { NoteSummary } from "@space/shared";
import { Flag } from "lucide-react-native";
import { View } from "react-native";

import { flattenNotePages, useStudentNotes } from "../../hooks/use-notes";
import { formatDate } from "../../lib/format";
import { InlineError } from "../layout/route-states";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Text } from "../ui/text";
import { Loading } from "./student-activity-tabs";
import { NoteForm } from "./note-form";

const NOTE_VISIBILITY: Record<NoteSummary["visibility"], string> = {
  LEADERS: "Visible to group leaders only",
  MENTORS: "Visible to mentors only",
  ADMINS: "Visible to season admins only",
};

function NoteCard({ note }: { note: NoteSummary }) {
  return (
    <Card>
      <CardContent className="flex-col gap-2 pt-4">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs font-medium text-foreground">{note.authorName}</Text>
          <Badge variant="outline" textClassName="text-[10px]">
            {note.authorRole}
          </Badge>
          {note.followUpFlagged ? (
            <Badge variant="warning" textClassName="text-[10px]">
              Follow up
            </Badge>
          ) : null}
          <Text className="text-xs text-muted-foreground">·</Text>
          <Text className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</Text>
          {note.seasonTitle ? (
            <>
              <Text className="text-xs text-muted-foreground">·</Text>
              <Text className="text-xs text-muted-foreground">{note.seasonTitle}</Text>
            </>
          ) : null}
          {note.edited ? <Text className="text-xs text-muted-foreground">· Edited</Text> : null}
        </View>
        <Text className="text-sm">{note.body}</Text>
        {/* V2-ONLY: the rule the API actually enforces (spec 09 D3), in words, in place of v1's bare enum badge. */}
        <Text className="text-xs text-muted-foreground">{NOTE_VISIBILITY[note.visibility]}</Text>
      </CardContent>
    </Card>
  );
}

export function NotesTab({
  studentId,
  canWriteNote,
}: {
  studentId: number;
  canWriteNote: boolean;
}) {
  const q = useStudentNotes(studentId, true);
  const notes = flattenNotePages(q.data?.pages);
  return (
    <View className="flex-col gap-4">
      {canWriteNote ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a note</CardTitle>
          </CardHeader>
          <CardContent>
            <NoteForm studentUserId={studentId} />
          </CardContent>
        </Card>
      ) : null}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <InlineError message="Couldn't load notes." onRetry={() => void q.refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No notes yet"
          description="Notes you can see will appear here."
        />
      ) : (
        <View className="flex-col gap-3">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
          {/* Older notes stay reachable (R41); v1 capped the list. */}
          {q.hasNextPage ? (
            <Button
              variant="outline"
              className="self-start"
              disabled={q.isFetchingNextPage}
              onPress={() => void q.fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}
