import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import type { AuthoredNote, NoteStudentOption, NoteVisibility } from "@space/shared";

import { NoteStudentPicker } from "../../src/components/NoteStudentPicker";
import {
  flattenNotePages,
  useAuthoredNotes,
  useCreateMentorNote,
  useNoteStudentOptions,
} from "../../src/hooks/use-notes";
import { formatDayKey } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../src/ui";

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
        {/* The server's org-day, so every reader sees one date, as v1 (R90). */}
        <Text variant="label" color={theme.colors.neutral[600]}>
          {item.seasonTitle
            ? `${formatDayKey(item.createdDayKey)} · ${item.seasonTitle}`
            : formatDayKey(item.createdDayKey)}
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

/**
 * v1's mentor composer (mentor-note-composer.tsx; R12, R45): pick a student,
 * write the note, optionally flag it for admin follow-up. Visibility is fixed
 * MENTORS, as v1.
 */
function MentorNoteComposer({ students }: { students: NoteStudentOption[] }) {
  const theme = useTheme();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateMentorNote();

  const submit = () => {
    setError(null);
    if (studentId === null) {
      setError("Pick a student.");
      return;
    }
    if (body.trim() === "") {
      setError("Note can't be empty.");
      return;
    }
    create.mutate(
      { studentId, body: body.trim(), followUpFlagged: followUp },
      {
        onSuccess: () => {
          setBody("");
          setFollowUp(false);
          setStudentId(null);
        },
        onError: () => setError("Couldn't save that note. Check your connection and try again."),
      },
    );
  };

  return (
    <Card style={{ marginBottom: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">New note</Text>
      <NoteStudentPicker
        label="Student"
        options={students}
        value={studentId}
        onChange={setStudentId}
        clearLabel="Change student"
      />
      <Input
        label="Note"
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={5}
        placeholder="Reflections, prayer requests, follow-up items…"
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
        <Switch
          accessibilityLabel="Flag for admin follow-up"
          value={followUp}
          onValueChange={setFollowUp}
        />
        <Text variant="body">Flag for admin follow-up</Text>
      </View>
      {error ? (
        <Text variant="caption" color={theme.colors.error[600]}>
          {error}
        </Text>
      ) : null}
      <Button title="Add note" loading={create.isPending} onPress={submit} />
    </Card>
  );
}

export default function NotesScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  // v1 parity (src/app/mentor/notes/page.tsx:21; 09-notes R44): only MENTOR
  // has "My notes", and the API refuses everyone else.
  const isMentor = role === "MENTOR";
  // v1's ?student filter (page.tsx:23-24,36-37; R45).
  const [filterStudentId, setFilterStudentId] = useState<number | null>(null);
  const { data, isPending, isError, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAuthoredNotes(isMentor, filterStudentId);
  const students = useNoteStudentOptions(isMentor);
  const notes = flattenNotePages(data?.pages);

  const handleRefresh = () => {
    if (!isMentor) return;
    void refetch();
    void students.refetch();
  };

  if (!isMentor) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Notes" message="This screen is for mentors." />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching}>
      {students.isError ? (
        <ErrorState message="Couldn't load the student list." onRetry={() => void students.refetch()} />
      ) : students.data ? (
        <>
          <MentorNoteComposer students={students.data} />
          <View style={{ marginBottom: theme.spacing.md }}>
            <NoteStudentPicker
              label="Filter by student"
              options={students.data}
              value={filterStudentId}
              onChange={setFilterStudentId}
              clearLabel="All students"
            />
          </View>
        </>
      ) : (
        <LoadingState />
      )}
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load your notes." onRetry={() => void refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState title="No notes yet" message="Write your first note above." />
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
