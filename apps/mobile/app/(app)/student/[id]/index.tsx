import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import {
  dateOnlyFromIso,
  type EnrollmentHistoryItem,
  type NoteSummary,
  type NoteVisibility,
} from "@space/shared";

import { DropEnrollmentSheet } from "../../../../src/components/DropEnrollmentSheet";
import { GraduateStudentSheet } from "../../../../src/components/GraduateStudentSheet";
import { isNoSeasonError, useStudentEngagement } from "../../../../src/hooks/use-engagement";
import { flattenNotePages, useCreateNote, useStudentNotes } from "../../../../src/hooks/use-notes";
import {
  useDeleteStudent,
  useStudentAttendanceHistory,
  useStudentDetail,
  useStudentDocuments,
  useStudentSubmissions,
  type StudentDetail,
} from "../../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { formatDate, formatDateTime, formatDayKey } from "../../../../src/lib/format";
import { studentActionsFor } from "../../../../src/lib/student-actions";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../src/ui";

function enrollmentStatusLabel(status: EnrollmentHistoryItem["status"]): string {
  if (status === "COMPLETED") return "Completed";
  if (status === "WITHDRAWN") return "Dropped";
  return "Active";
}

function ProfileCard({ detail }: { detail: StudentDetail }) {
  const theme = useTheme();
  const p = detail.profile;
  const rows: [string, string][] = [];
  if (p.university) rows.push(["University", p.university]);
  if (p.year) rows.push(["Year", p.year]);
  if (p.gifts) rows.push(["Gifts", p.gifts]);
  // Present only on the private/internal arms — the server narrows by role
  // (spec 06 §4.2); the client renders what its arm carries.
  if ("phone" in p && p.phone) rows.push(["Phone", p.phone]);
  if ("dateOfBirth" in p && p.dateOfBirth) {
    // A calendar day, read without any timezone (Plan 10 Decision 8).
    rows.push(["Date of birth", formatDayKey(dateOnlyFromIso(p.dateOfBirth))]);
  }
  if ("spiritualBackground" in p && p.spiritualBackground) {
    rows.push(["Spiritual background", p.spiritualBackground]);
  }
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Profile</Text>
      {rows.map(([label, value]) => (
        <Text key={label} variant="body">
          <Text variant="label" color={theme.colors.neutral[600]}>{`${label}: `}</Text>
          {value}
        </Text>
      ))}
    </Card>
  );
}

const ATTENDANCE_LABEL = { PRESENT: "Present", ABSENT: "Absent", LATE: "Late" } as const;

const SUBMISSION_STATUS_LABEL = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  REVIEWED: "Reviewed",
  RETURNED: "Returned",
} as const;

/** v1's Attendance tab (REG-83): the student's marks across seasons, newest first. */
function AttendanceHistoryCard({ studentId, enabled }: { studentId: number; enabled: boolean }) {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useStudentAttendanceHistory(studentId, enabled);
  if (!enabled) return null;
  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Attendance history</Text>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load attendance." onRetry={() => void refetch()} />
      ) : data.history.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          No attendance yet. Records appear here as sessions are marked.
        </Text>
      ) : (
        data.history.map((a) => (
          <View key={a.sessionId} style={{ paddingVertical: theme.spacing.xs }}>
            <Text variant="body">{`${a.sessionTitle} · ${ATTENDANCE_LABEL[a.status]}`}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${formatDateTime(a.startsAt)} · ${a.seasonTitle}`}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

/** v1's Submissions tab (REG-83): each row opens the review screen. */
function StudentSubmissionsCard({ studentId, enabled }: { studentId: number; enabled: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useStudentSubmissions(studentId, enabled);
  if (!enabled) return null;
  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Submissions</Text>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load submissions." onRetry={() => void refetch()} />
      ) : data.submissions.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          No submissions yet.
        </Text>
      ) : (
        data.submissions.map((s) => (
          <Pressable
            key={s.publicId}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/submission/[publicId]", params: { publicId: s.publicId } })}
            style={{ paddingVertical: theme.spacing.xs }}
          >
            <Text variant="body">{`${s.assignmentTitle} · ${SUBMISSION_STATUS_LABEL[s.status]}${s.isLate ? " · Late" : ""}`}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {s.submittedAt ? `${s.seasonTitle} · submitted ${formatDate(s.submittedAt)}` : s.seasonTitle}
            </Text>
          </Pressable>
        ))
      )}
    </Card>
  );
}

/**
 * v1's read-only Documents tab (06-students R80, `student-detail.tsx:342-368`):
 * SUPER and ADMIN only, name · type · size · upload date, newest first, no
 * download link.
 */
function DocumentsCard({ studentId, enabled }: { studentId: number; enabled: boolean }) {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useStudentDocuments(studentId, enabled);
  if (!enabled) return null;
  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Documents</Text>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load documents." onRetry={() => void refetch()} />
      ) : data.documents.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          No documents
        </Text>
      ) : (
        data.documents.map((d) => (
          <View key={d.id} style={{ paddingVertical: theme.spacing.xs }}>
            <Text variant="body">{d.originalName}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${d.mimeType} · ${(d.sizeBytes / 1024).toFixed(1)} KB · uploaded ${formatDate(d.uploadedAt)}`}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

function EnrollmentRow({ item, onDrop }: { item: EnrollmentHistoryItem; onDrop: (() => void) | null }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.sm }}>
      <Text variant="body">{item.seasonTitle}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {[enrollmentStatusLabel(item.status), item.groupName].filter(Boolean).join(" · ")}
      </Text>
      {/* Staff-only: null in the student's own view (REG-83). */}
      {item.attendancePct !== null ? (
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${item.attendancePct}% attendance`}
        </Text>
      ) : null}
      {item.dropReason ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {item.dropReason}
        </Text>
      ) : null}
      {onDrop ? <Button title="Drop" variant="ghost" onPress={onDrop} /> : null}
    </Card>
  );
}

const VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  LEADERS: "Visible to group leaders only",
  MENTORS: "Visible to mentors only",
  ADMINS: "Visible to season admins only",
};

const VISIBILITY_ORDER: NoteVisibility[] = ["LEADERS", "MENTORS", "ADMINS"];

/**
 * The engagement card.
 *
 * Every number here is served, not computed. v1 re-derived the score at each
 * render site (four student-detail pages, the mentor dashboard, the reports
 * screen), which is how "at risk" ended up meaning three different things
 * (spec R73/R74, D7) and how the mentor dashboard came to issue 4N queries per
 * render (R80, D10).
 *
 * The absence-budget figure is NOT here. It is domain 4's number on domain 4's
 * terms, it means "absence budget remaining" rather than "attendance" (spec
 * R68/R87, D8 #2), and it inherits ruling C3's wrong-instant lateness defect,
 * which this domain's attendancePct does not — see
 * docs/superpowers/specs/domains/04-attendance.md.
 */
function EngagementCard({ studentId, enabled }: { studentId: number; enabled: boolean }) {
  const theme = useTheme();
  const { data, isPending, isError, error, refetch } = useStudentEngagement(studentId, enabled);

  if (!enabled) return null;

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Engagement</Text>
      {isPending ? (
        <LoadingState />
      ) : isError && isNoSeasonError(error) ? (
        // The one error that is an answer (404 no_season).
        <Text variant="body" color={theme.colors.neutral[600]}>
          No season to score yet
        </Text>
      ) : isError ? (
        // Everything else is a failure, shown as one, with a retry guarded by
        // the same `enabled` the query uses (CLAUDE.md "Data fetching").
        <ErrorState
          message="Couldn't load engagement."
          onRetry={() => {
            if (enabled) void refetch();
          }}
        />
      ) : (
        <>
          <Text variant="title">{String(data.score)}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`Attendance ${data.attendancePct}%`}
          </Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`Submissions ${data.submissionPct}%`}
          </Text>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {`${data.attendancePresent}/${data.attendanceTotal} sessions · ${data.submissionsCompleted}/${data.submissionsExpected} assignments`}
          </Text>
          {data.atRisk ? <Text variant="label">At risk</Text> : null}
        </>
      )}
    </Card>
  );
}

function NoteCard({ item }: { item: NoteSummary }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.sm }}>
      <Text variant="body">{item.body}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {`${item.authorName} · ${formatDate(item.createdAt)}`}
      </Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {VISIBILITY_LABEL[item.visibility]}
      </Text>
      {item.followUpFlagged ? <Text variant="caption">Follow-up flagged</Text> : null}
      {item.edited ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Edited
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * Chip labels for the composer. Short on purpose: the full "Visible to …"
 * sentence belongs to a WRITTEN note's caption, and reusing it on the chips
 * made the same text appear twice on screen.
 */
const VISIBILITY_CHIP: Record<NoteVisibility, string> = {
  LEADERS: "Group leaders",
  MENTORS: "Mentors",
  ADMINS: "Season admins",
};

function NoteComposer({ studentId }: { studentId: number }) {
  const theme = useTheme();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("LEADERS");
  const create = useCreateNote(studentId);

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Write a note</Text>
      {/*
        The copy v1 got wrong. Its composer said "Who can read this note (in
        addition to you and admins)" while the filter matched the viewer's role
        against the setting by equality, so admins read none of the LEADERS
        notes the schema defaults to (spec R36, D3). Widening the rule to match
        the promise would expose historic notes written under a different one;
        the plan defers that to the pastoral owner and tells the truth here.
      */}
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Only the group you choose can read this note, plus you and SUPER users. Season admins do
        not automatically see leader or mentor notes.
      </Text>
      <Input label="New note" value={body} onChangeText={setBody} multiline numberOfLines={5} />
      <Text variant="label" color={theme.colors.neutral[600]}>
        Who can read it
      </Text>
      {VISIBILITY_ORDER.map((v) => (
        <Button
          key={v}
          title={VISIBILITY_CHIP[v]}
          accessibilityState={{ selected: v === visibility }}
          variant={v === visibility ? "primary" : "secondary"}
          onPress={() => setVisibility(v)}
        />
      ))}
      <Button
        title="Save note"
        loading={create.isPending}
        onPress={() => {
          if (body.trim().length < 2) return;
          create.mutate(
            // followUpFlagged is sent explicitly rather than omitted so the
            // request shape matches the contract's default exactly.
            { body: body.trim(), visibility, followUpFlagged: false },
            { onSuccess: () => setBody("") },
          );
        }}
      />
      {create.isError ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Couldn&apos;t save that note. Check your connection and try again.
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * Notes come from their own gated endpoint, always.
 *
 * They deliberately do NOT ride inside the student-detail payload (spec D5
 * #3): in v1 they did, and the payload's safety then depended on every
 * consumer remembering to filter it afterwards (R38). A separate request means
 * a separate gate, and it means this block can be refused without the rest of
 * the screen failing.
 */
function NotesSection({ studentId, enabled }: { studentId: number; enabled: boolean }) {
  const theme = useTheme();
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useStudentNotes(studentId, enabled);
  const notes = flattenNotePages(data?.pages);

  if (!enabled) return null;

  return (
    <>
      <NoteComposer studentId={studentId} />
      <Card style={{ marginTop: theme.spacing.md }}>
        <Text variant="heading">Notes</Text>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Couldn't load notes." onRetry={() => void refetch()} />
        ) : notes.length === 0 ? (
          <Text variant="body" color={theme.colors.neutral[600]}>
            No notes about this student yet.
          </Text>
        ) : (
          <>
            {notes.map((n) => (
              <NoteCard key={n.id} item={n} />
            ))}
            {/* Older notes are reachable — v1's 100-row cap hid them (R41). */}
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
      </Card>
    </>
  );
}

export default function StudentDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const scopes = useSessionStore((s) => s.scopes);
  const role = user?.role ?? null;
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch } = useStudentDetail(id, role);
  const deleteStudent = useDeleteStudent();
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<EnrollmentHistoryItem | null>(null);

  const confirmDelete = (studentId: number, name: string) => {
    Alert.alert(
      `Delete ${name}?`,
      "They'll disappear from every list and be signed out everywhere. Their enrollment history, attendance and submissions are kept, and a SUPER can reactivate the account from Users.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteStudent.mutate(
              { id: studentId },
              {
                onSuccess: () => router.replace("/students"),
                onError: (err) => Alert.alert("Couldn't delete", apiErrorMessage(err, "Try again.")),
              },
            ),
        },
      ],
    );
  };

  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That student link isn't valid." />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this student." onRetry={() => void refetch()} />
      ) : (
        (() => {
          const actions = studentActionsFor(user, scopes, data);
          return (
            <>
              <Text variant="title">{data.name}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {data.email}
              </Text>
              {data.graduationYear !== null ? (
                <Text variant="label" color={theme.colors.neutral[600]}>
                  {`Alumnus — Class of ${data.graduationYear}`}
                </Text>
              ) : null}
              {data.currentGroup ? (
                <Text variant="label" color={theme.colors.neutral[600]}>
                  {`Current group: ${data.currentGroup.name}`}
                </Text>
              ) : null}

              {/* v1's Email and Call buttons (student-detail.tsx:79-86); Call only with a phone. */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
                <Button
                  title="Email"
                  variant="secondary"
                  onPress={() => void Linking.openURL(`mailto:${data.email}`)}
                />
                {"phone" in data.profile && data.profile.phone ? (
                  <Button
                    title="Call"
                    variant="secondary"
                    onPress={() => {
                      if ("phone" in data.profile && data.profile.phone) {
                        void Linking.openURL(`tel:${data.profile.phone}`);
                      }
                    }}
                  />
                ) : null}
              </View>

              {actions.canEdit || actions.canGraduate || actions.canDelete ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
                  {actions.canEdit ? (
                    <Button
                      title="Edit"
                      variant="secondary"
                      onPress={() =>
                        router.push({ pathname: "/student/[id]/edit", params: { id: String(data.id) } })
                      }
                    />
                  ) : null}
                  {actions.canGraduate ? (
                    <Button title="Graduate" variant="secondary" onPress={() => setGraduateOpen(true)} />
                  ) : null}
                  {actions.canDelete ? (
                    <Button
                      title="Delete student"
                      variant="ghost"
                      loading={deleteStudent.isPending}
                      onPress={() => confirmDelete(data.id, data.name)}
                    />
                  ) : null}
                </View>
              ) : null}

              <ProfileCard detail={data} />
              {"notes" in data.profile && data.profile.notes ? (
                <Card style={{ marginTop: theme.spacing.md }}>
                  <Text variant="heading">Internal notes</Text>
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    Staff only — the student never receives this field.
                  </Text>
                  <Text variant="body">{data.profile.notes}</Text>
                </Card>
              ) : null}
              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">Seasons</Text>
                {data.enrollments.length === 0 ? (
                  <Text variant="body" color={theme.colors.neutral[600]}>
                    No enrollments yet.
                  </Text>
                ) : (
                  data.enrollments.map((e) => (
                    <EnrollmentRow
                      key={e.enrollmentId}
                      item={e}
                      onDrop={actions.canDrop(e) ? () => setDropTarget(e) : null}
                    />
                  ))
                )}
              </Card>
              <EngagementCard studentId={id} enabled={role !== null && role !== "STUDENT"} />
              <AttendanceHistoryCard studentId={id} enabled={role !== null && role !== "STUDENT"} />
              <StudentSubmissionsCard studentId={id} enabled={role !== null && role !== "STUDENT"} />
              <NotesSection studentId={id} enabled={role !== null && role !== "STUDENT"} />
              <DocumentsCard studentId={id} enabled={role === "SUPER" || role === "ADMIN"} />

              {actions.canGraduate ? (
                <GraduateStudentSheet
                  visible={graduateOpen}
                  studentId={data.id}
                  studentName={data.name}
                  onClose={() => setGraduateOpen(false)}
                />
              ) : null}
              <DropEnrollmentSheet studentId={data.id} enrollment={dropTarget} onClose={() => setDropTarget(null)} />
            </>
          );
        })()
      )}
    </Screen>
  );
}
