/**
 * The student-page tab bodies as grouped lists, for the leader's and mentor's
 * page (StudentDetailGrouped) and the admin's (AdminStudentDetail).
 */
import { dateOnlyFromIso, type EnrollmentHistoryItem, type NoteSummary } from "@space/shared";
import { useRouter } from "expo-router";
import { Calendar, Flag, MapPin } from "lucide-react-native";
import { View } from "react-native";

import { flattenNotePages, useStudentNotes } from "../../hooks/use-notes";
import { useStudentAttendanceHistory, useStudentSubmissions } from "../../hooks/use-students";
import type { StudentDetail as StudentDetailData } from "../../hooks/use-students";
import { formatDate, formatDateTime, formatDayKey } from "../../lib/format";
import { InlineError } from "../layout/route-states";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { StatusChip, statusChip } from "../ui/status-chip";
import { Text } from "../ui/text";

function Loading() {
  return <Text className="py-4 text-center text-sm text-muted-foreground">Loading…</Text>;
}

/** Caption parts joined with a separator, skipping the empty ones: no dangling dot. */
const caption = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

export function GroupedProfileTab({ profile: p }: { profile: StudentDetailData["profile"] }) {
  const rows: [string, string | null][] = [
    ["University", p.university],
    ["Year / faculty", p.year],
    ["Gifts / interests", p.gifts],
  ];
  if ("phone" in p) rows.push(["Phone", p.phone]);
  if ("dateOfBirth" in p)
    rows.push(["Date of birth", p.dateOfBirth ? formatDayKey(dateOnlyFromIso(p.dateOfBirth)) : null]);
  if ("spiritualBackground" in p) rows.push(["Spiritual background", p.spiritualBackground]);
  if ("notes" in p && p.notes) rows.push(["Internal notes", p.notes]);
  return (
    <GroupedList>
      {rows.map(([label, value]) => (
        <ListRow key={label} title={value ?? "—"} subtitle={label} titleLines={null} />
      ))}
    </GroupedList>
  );
}

export function GroupedSeasonsTab({ enrollments }: { enrollments: EnrollmentHistoryItem[] }) {
  if (enrollments.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No seasons"
        description="This student isn't enrolled in any season yet."
      />
    );
  }
  return (
    <GroupedList>
      {enrollments.map((e, i) => (
        <ListRow
          key={e.enrollmentId}
          index={i}
          title={e.seasonTitle}
          subtitle={caption(`${formatDate(e.startDate)} – ${formatDate(e.endDate)}`, e.groupName, e.dropReason)}
          subtitleLines={3}
          trailing={
            <View className="items-end gap-1">
              <StatusChip {...statusChip("enrollment", e.status)} />
              {e.attendancePct !== null ? (
                <Text variant="caption" className="text-muted-foreground">{`${e.attendancePct}% attendance`}</Text>
              ) : null}
            </View>
          }
          trailingLabel={caption(statusChip("enrollment", e.status).label, e.attendancePct !== null && `${e.attendancePct}% attendance`)}
        />
      ))}
    </GroupedList>
  );
}

export function GroupedAttendanceTab({ studentId }: { studentId: number }) {
  const q = useStudentAttendanceHistory(studentId, true);
  if (q.isPending) return <Loading />;
  if (q.isError)
    return <InlineError message="Couldn't load attendance." onRetry={() => void q.refetch()} />;
  if (q.data.history.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No attendance yet"
        description="Attendance records will appear here as sessions are marked."
      />
    );
  }
  return (
    <GroupedList>
      {q.data.history.map((r, i) => (
        <ListRow
          key={r.sessionId}
          index={i}
          title={r.sessionTitle}
          // Instant in the device zone: no org day on this row (X13, gap note).
          subtitle={caption(formatDateTime(r.startsAt), r.seasonTitle)}
          trailing={<StatusChip {...statusChip("attendance", r.status)} />}
        />
      ))}
    </GroupedList>
  );
}

export function GroupedSubmissionsTab({ studentId }: { studentId: number }) {
  const router = useRouter();
  const q = useStudentSubmissions(studentId, true);
  if (q.isPending) return <Loading />;
  if (q.isError)
    return <InlineError message="Couldn't load submissions." onRetry={() => void q.refetch()} />;
  if (q.data.submissions.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No submissions"
        description="Submissions visible to you will appear here."
      />
    );
  }
  return (
    <GroupedList>
      {q.data.submissions.map((s, i) => {
        const status = statusChip("submission", s.status);
        return (
          <ListRow
            key={s.publicId}
            index={i}
            title={s.assignmentTitle}
            subtitle={caption(s.seasonTitle, s.submittedAt && `submitted ${formatDate(s.submittedAt)}`)}
            chevron
            onPress={() =>
              router.push({ pathname: "/submission/[publicId]", params: { publicId: s.publicId } })
            }
            trailing={
              <View className="items-end gap-1">
                {s.isLate ? <StatusChip tone="warn" label="Late" /> : null}
                <StatusChip {...status} />
              </View>
            }
            trailingLabel={caption(s.isLate && "Late", status.label)}
          />
        );
      })}
    </GroupedList>
  );
}

const NOTE_VISIBILITY: Record<NoteSummary["visibility"], string> = {
  LEADERS: "Visible to group leaders only",
  MENTORS: "Visible to mentors only",
  ADMINS: "Visible to season admins only",
};

export function GroupedNotesTab({
  studentId,
  canWriteNote,
  onWrite,
}: {
  studentId: number;
  canWriteNote: boolean;
  onWrite: () => void;
}) {
  const q = useStudentNotes(studentId, true);
  const notes = flattenNotePages(q.data?.pages);
  return (
    <View className="flex-col gap-4">
      {canWriteNote ? (
        <Button variant="secondary" className="self-start" onPress={onWrite}>
          Write a note
        </Button>
      ) : null}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <InlineError message="Couldn't load notes." onRetry={() => void q.refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState icon={Flag} title="No notes yet" description="Notes you can see will appear here." />
      ) : (
        <>
          <GroupedList>
            {notes.map((n, i) => (
              <ListRow
                key={n.id}
                index={i}
                title={n.body}
                titleLines={null}
                subtitle={caption(
                  n.authorName,
                  n.authorRole,
                  formatDate(n.createdAt),
                  n.seasonTitle,
                  n.edited && "Edited",
                  NOTE_VISIBILITY[n.visibility],
                )}
                subtitleLines={3}
                trailing={n.followUpFlagged ? <StatusChip tone="warn" label="Follow up" /> : undefined}
              />
            ))}
          </GroupedList>
          {/* Older notes stay reachable (R41); v1 capped the list. */}
          {q.hasNextPage ? (
            <Button
              variant="secondary"
              className="self-start"
              disabled={q.isFetchingNextPage}
              onPress={() => void q.fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </>
      )}
    </View>
  );
}
