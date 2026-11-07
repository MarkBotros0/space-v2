/**
 * The student page's sections as grouped lists (Seasons, Attendance,
 * Submissions, Notes), for the leader's and mentor's page
 * (StudentDetailGrouped) and the admin's (AdminStudentDetail). The details
 * list is StudentDetails.
 */
import type { EnrollmentHistoryItem } from "@space/shared";
import { useRouter } from "expo-router";
import { Calendar, Flag, MapPin } from "lucide-react-native";
import { View } from "react-native";

import { flattenNotePages, useStudentNotes } from "../../hooks/use-notes";
import { useStudentAttendanceHistory, useStudentSubmissions } from "../../hooks/use-students";
import { formatDate, formatDateTime, formatSeasonDay, unbreakable } from "../../lib/format";
import { VISIBILITY_LABEL } from "../../lib/note-visibility";
import { NAV_ICONS } from "../icons/nav-icon";
import { InlineError } from "../layout/route-states";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { StatusChip, statusChip } from "../ui/status-chip";
import { Text } from "../ui/text";
import { USER_ROLE_LABELS } from "../../lib/user-role-labels";

function Loading() {
  return (
    <Text variant="subhead" className="py-4 text-center text-muted-foreground">
      Loading…
    </Text>
  );
}

/** Caption parts joined with a separator, skipping the empty ones: no dangling dot. */
const caption = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

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
      {enrollments.map((e) => (
        <ListRow
          key={e.enrollmentId}
          title={e.seasonTitle}
          titleLines={2}
          subtitle={caption(`${formatSeasonDay(e.startDate)} – ${formatSeasonDay(e.endDate)}`, e.groupName && unbreakable(e.groupName), e.dropReason)}
          subtitleLines={null}
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

/**
 * Every mark, newest first. `bySeason` (the mentor, owner 2026-11-07) groups them
 * under each season's name, the one place a season shows: where the session was.
 */
export function GroupedAttendanceTab({ studentId, bySeason = false }: { studentId: number; bySeason?: boolean }) {
  const q = useStudentAttendanceHistory(studentId, true);
  if (q.isPending) return <Loading />;
  if (!q.data)
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
  const row = (r: (typeof q.data.history)[number]) => (
    <ListRow
      key={r.sessionId}
      title={r.sessionTitle}
      titleLines={2}
      // Instant in the device zone: no org day on this row (X13, gap note).
      subtitle={bySeason ? formatDateTime(r.startsAt) : caption(formatDateTime(r.startsAt), r.seasonTitle)}
      trailing={<StatusChip {...statusChip("attendance", r.status)} />}
    />
  );
  if (!bySeason) return <GroupedList>{q.data.history.map(row)}</GroupedList>;
  // Newest first already, so each season's group keeps that order and seasons follow their newest mark.
  const seasons: { id: number; title: string; rows: typeof q.data.history }[] = [];
  for (const r of q.data.history) {
    const last = seasons.find((g) => g.id === r.seasonId);
    if (last) last.rows.push(r);
    else seasons.push({ id: r.seasonId, title: r.seasonTitle, rows: [r] });
  }
  return (
    <View className="flex-col gap-4">
      {seasons.map((g) => (
        <GroupedList key={g.id} header={g.title}>
          {g.rows.map(row)}
        </GroupedList>
      ))}
    </View>
  );
}

export function GroupedSubmissionsTab({ studentId }: { studentId: number }) {
  const router = useRouter();
  const q = useStudentSubmissions(studentId, true);
  if (q.isPending) return <Loading />;
  if (!q.data)
    return <InlineError message="Couldn't load submissions." onRetry={() => void q.refetch()} />;
  if (q.data.submissions.length === 0) {
    return (
      <EmptyState
        icon={NAV_ICONS.submissions}
        title="No submissions"
        description="Submissions visible to you will appear here."
      />
    );
  }
  return (
    <GroupedList>
      {q.data.submissions.map((s) => {
        const status = statusChip("submission", s.status);
        return (
          <ListRow
            key={s.publicId}
            title={s.assignmentTitle}
            titleLines={2}
            subtitle={caption(s.seasonTitle, s.submittedAt && `submitted ${formatDate(s.submittedAt)}`)}
            subtitleLines={null}
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

export function GroupedNotesTab({
  studentId,
  canWriteNote,
  onWrite,
  seasonless = false,
}: {
  studentId: number;
  canWriteNote: boolean;
  onWrite: () => void;
  /** The mentor (owner, 2026-11-07): no season on a note. */
  seasonless?: boolean;
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
      ) : !q.data ? (
        <InlineError message="Couldn't load notes." onRetry={() => void q.refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState icon={Flag} title="No notes yet" description="Notes you can see will appear here." />
      ) : (
        <>
          <GroupedList>
            {notes.map((n) => (
              <ListRow
                key={n.id}
                title={n.body}
                titleLines={null}
                subtitle={caption(
                  n.authorName,
                  USER_ROLE_LABELS[n.authorRole],
                  formatDate(n.createdAt),
                  seasonless ? null : n.seasonTitle,
                  n.edited && "Edited",
                  VISIBILITY_LABEL[n.visibility],
                )}
                subtitleLines={null}
                trailing={n.followUpFlagged ? <StatusChip tone="warn" label="Follow up" /> : undefined}
                trailingPlacement="below"
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
