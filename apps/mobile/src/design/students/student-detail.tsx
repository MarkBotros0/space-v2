/**
 * Port of v1 components/students/student-detail.tsx for the leader view
 * (B3-15): hero, engagement, and the Profile · Seasons · Attendance ·
 * Submissions · Notes tabs. v2 differences: a leader's payload carries no
 * phone, date of birth, spiritual background or internal notes (spec 06
 * D3/C8), so those fields and the Call button are absent rather than "—";
 * each tab's data is fetched the first time the tab opens (spec 06 §9);
 * note bodies are plain text (spec 09 D1). The tab row scrolls sideways
 * (five tabs overflow 375px; v1 let the whole page scroll).
 */
import { dateOnlyFromIso, type EnrollmentHistoryItem, type NoteSummary } from "@space/shared";
import { useRouter } from "expo-router";
import { Calendar, Flag, Mail, MapPin, Phone } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";

import { isNoSeasonError, useStudentEngagement } from "../../hooks/use-engagement";
import { flattenNotePages, useStudentNotes } from "../../hooks/use-notes";
import {
  useStudentAttendanceHistory,
  useStudentSubmissions,
  type StudentDetail as StudentDetailData,
} from "../../hooks/use-students";
import { formatDate, formatDateTime, formatDayKey } from "../../lib/format";
import { initialsOf } from "../../lib/initials";
import { iconWithClassName } from "../lib/icon";
import { AttendancePill } from "../ui/attendance-pill";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Progress } from "../ui/progress";
import { SubmissionStatusBadge } from "../ui/submission-status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Text } from "../ui/text";
import { NoteForm } from "./note-form";

iconWithClassName(Mail, Phone);

type Tab = "profile" | "seasons" | "attendance" | "submissions" | "notes";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View>
      <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      {value ? (
        <Text className="mt-1 text-sm text-foreground">{value}</Text>
      ) : (
        <Text className="mt-1 text-sm italic text-muted-foreground">—</Text>
      )}
    </View>
  );
}

/** v1 printed the enum; "WITHDRAWN" reads as "Dropped" everywhere else in the app. */
const ENROLLMENT_STATUS: Record<EnrollmentHistoryItem["status"], string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  WITHDRAWN: "Dropped",
};

function Loading() {
  return <Text className="py-4 text-center text-sm text-muted-foreground">Loading…</Text>;
}

function Failed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <View className="flex-col items-start gap-2">
      <Text className="text-sm text-error-600 dark:text-error-400">{`Couldn't load ${what}.`}</Text>
      <Button variant="outline" size="sm" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}

function EngagementCard({ studentId }: { studentId: number }) {
  const q = useStudentEngagement(studentId, true);
  // v1 renders the card only when the student has a current season (404 no_season = no card).
  if (q.isPending || (q.isError && isNoSeasonError(q.error))) return null;
  if (q.isError) return <Failed what="engagement" onRetry={() => void q.refetch()} />;
  const e = q.data;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Engagement (current season)</CardTitle>
        {/* V2-ONLY: the single at-risk definition (C4). */}
        {e.atRisk ? <Badge variant="error">At risk</Badge> : null}
      </CardHeader>
      <CardContent className="flex-col gap-3">
        <View className="flex-row items-center gap-3">
          <Progress value={e.score} className="flex-1" />
          <Text className="text-sm font-semibold">{`${e.score}%`}</Text>
        </View>
        <View className="flex-row gap-3">
          <Text className="flex-1 text-xs text-muted-foreground">
            {`Attendance: ${e.attendancePresent}/${e.attendanceTotal} (${e.attendancePct}%)`}
          </Text>
          <Text className="flex-1 text-xs text-muted-foreground">
            {`Submissions: ${e.submissionsCompleted}/${e.submissionsExpected} (${e.submissionPct}%)`}
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}

function AttendanceTab({ studentId }: { studentId: number }) {
  const q = useStudentAttendanceHistory(studentId, true);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed what="attendance" onRetry={() => void q.refetch()} />;
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
    <Card>
      <CardContent className="p-0">
        {q.data.history.map((r, i) => (
          <View
            key={r.sessionId}
            className={`flex-row items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm font-medium">
                {r.sessionTitle}
              </Text>
              {/* Instant in the device zone: no org day on this row (X13, gap note). */}
              <Text className="text-xs text-muted-foreground">{`${formatDateTime(r.startsAt)} · ${r.seasonTitle}`}</Text>
            </View>
            <AttendancePill status={r.status} />
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

function SubmissionsTab({ studentId }: { studentId: number }) {
  const router = useRouter();
  const q = useStudentSubmissions(studentId, true);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed what="submissions" onRetry={() => void q.refetch()} />;
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
    <Card>
      <CardContent className="p-0">
        {q.data.submissions.map((s, i) => (
          <View
            key={s.publicId}
            className={`flex-row items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <View className="min-w-0 flex-1">
              <Pressable
                accessibilityRole="link"
                className="self-start"
                onPress={() =>
                  router.push({
                    pathname: "/submission/[publicId]",
                    params: { publicId: s.publicId },
                  })
                }
              >
                <Text numberOfLines={1} className="text-sm font-medium">
                  {s.assignmentTitle}
                </Text>
              </Pressable>
              <Text className="text-xs text-muted-foreground">
                {`${s.seasonTitle}${s.submittedAt ? ` · submitted ${formatDate(s.submittedAt)}` : ""}`}
              </Text>
            </View>
            <View className="shrink-0 flex-row items-center gap-1.5">
              {s.isLate ? <Badge variant="warning">Late</Badge> : null}
              <SubmissionStatusBadge status={s.status} />
            </View>
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

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

function NotesTab({ studentId, canWriteNote }: { studentId: number; canWriteNote: boolean }) {
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
        <Failed what="notes" onRetry={() => void q.refetch()} />
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

export interface StudentDetailProps {
  student: StudentDetailData;
  canWriteNote: boolean;
  /** Extra hero buttons (Edit profile, Graduate, Delete) — staff only. */
  actions?: ReactNode;
  /** A season's Drop control, or null when the caller may not drop it (REG-83). */
  dropFor?: (enrollment: EnrollmentHistoryItem) => (() => void) | null;
  /** False for a student viewing their own page: the staff endpoints would refuse the tabs. */
  staffTabs?: boolean;
}

/**
 * Shared by the leader and the admin/super/mentor pages (v1 uses one component
 * for all of them). The admin payload carries more profile (phone, date of
 * birth, spiritual background, internal notes — spec 06 §4.2); a field is shown
 * only when the arm the server sent has it.
 */
export function StudentDetail({
  student,
  canWriteNote,
  actions,
  dropFor,
  staffTabs = true,
}: StudentDetailProps) {
  const [tab, setTab] = useState<Tab>("profile");
  // A tab's queries mount the first time it opens and stay mounted (cache kept).
  const [opened, setOpened] = useState<Set<Tab>>(() => new Set<Tab>(["profile"]));
  const open = (t: string) => {
    setTab(t as Tab);
    setOpened((prev) => new Set(prev).add(t as Tab));
  };
  const lazy = (t: Tab, node: ReactNode) => (opened.has(t) ? node : null);
  const p = student.profile;
  const phone = "phone" in p ? p.phone : null;
  const dateOfBirth =
    "dateOfBirth" in p && p.dateOfBirth ? formatDayKey(dateOnlyFromIso(p.dateOfBirth)) : null;
  const spiritual = "spiritualBackground" in p ? p.spiritualBackground : null;
  const internalNotes = "notes" in p ? p.notes : null;

  return (
    <View className="flex-col gap-4">
      <Card>
        <CardContent className="flex-col gap-4 pt-6">
          <View className="flex-row items-center gap-3">
            <Avatar className="size-14">
              <AvatarFallback>
                {initialsOf(student.name, student.email.slice(0, 1).toUpperCase() || "?")}
              </AvatarFallback>
            </Avatar>
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-semibold">{student.name}</Text>
              <Text className="text-sm text-muted-foreground">{student.email}</Text>
              <View className="mt-1 flex-row flex-wrap gap-2">
                {student.graduationYear !== null ? (
                  <Badge variant="success">{`Alumnus · ${student.graduationYear}`}</Badge>
                ) : null}
                {p.activeSeasonTitle ? (
                  <Badge variant="outline">{p.activeSeasonTitle}</Badge>
                ) : null}
                {student.currentGroup ? (
                  <Badge variant="secondary">{student.currentGroup.name}</Badge>
                ) : null}
              </View>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            <Button
              variant="outline"
              onPress={() => void Linking.openURL(`mailto:${student.email}`)}
            >
              <Mail size={16} className="text-foreground" />
              Email
            </Button>
            {phone ? (
              <Button variant="outline" onPress={() => void Linking.openURL(`tel:${phone}`)}>
                <Phone size={16} className="text-foreground" />
                Call
              </Button>
            ) : null}
            {actions}
          </View>
        </CardContent>
      </Card>

      {staffTabs ? <EngagementCard studentId={student.id} /> : null}

      <Tabs value={tab} onValueChange={open}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="seasons">Seasons</TabsTrigger>
            {staffTabs ? <TabsTrigger value="attendance">Attendance</TabsTrigger> : null}
            {staffTabs ? <TabsTrigger value="submissions">Submissions</TabsTrigger> : null}
            {staffTabs ? <TabsTrigger value="notes">Notes</TabsTrigger> : null}
          </TabsList>
        </ScrollView>

        <TabsContent value="profile">
          <Card>
            <CardContent className="flex-col gap-3 pt-6">
              <Field label="University" value={p.university} />
              <Field label="Year / faculty" value={p.year} />
              <Field label="Gifts / interests" value={p.gifts} />
              {"phone" in p ? <Field label="Phone" value={phone} /> : null}
              {"dateOfBirth" in p ? <Field label="Date of birth" value={dateOfBirth} /> : null}
              {"spiritualBackground" in p ? (
                <Field label="Spiritual background" value={spiritual} />
              ) : null}
              {"notes" in p && internalNotes ? (
                <View>
                  <Field label="Internal notes" value={internalNotes} />
                  {/* Staff-only: the student's own payload never carries this field. */}
                  <Text className="mt-1 text-xs text-muted-foreground">
                    Staff only — the student never receives this field.
                  </Text>
                </View>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seasons">
          {student.enrollments.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No seasons"
              description="This student isn't enrolled in any season yet."
            />
          ) : (
            <View className="flex-col gap-3">
              {student.enrollments.map((e) => (
                <Card key={e.enrollmentId}>
                  <CardContent className="flex-col gap-2 pt-4">
                    <View>
                      <Text className="font-medium">{e.seasonTitle}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {`${formatDate(e.startDate)} – ${formatDate(e.endDate)}${e.groupName ? ` · ${e.groupName}` : ""}`}
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Badge variant="outline">{e.seasonStatus}</Badge>
                      <Badge variant={e.status === "ACTIVE" ? "info" : "secondary"}>
                        {ENROLLMENT_STATUS[e.status]}
                      </Badge>
                      {e.attendancePct !== null ? (
                        <Badge variant="success">{`${e.attendancePct}% attendance`}</Badge>
                      ) : null}
                    </View>
                    {e.dropReason ? (
                      <Text className="text-xs text-muted-foreground">{e.dropReason}</Text>
                    ) : null}
                    {dropFor?.(e) ? (
                      <Button
                        className="self-start"
                        variant="ghost"
                        size="sm"
                        onPress={dropFor(e)!}
                      >
                        Drop
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </View>
          )}
        </TabsContent>

        {staffTabs ? (
          <>
            <TabsContent value="attendance">
              {lazy("attendance", <AttendanceTab studentId={student.id} />)}
            </TabsContent>
            <TabsContent value="submissions">
              {lazy("submissions", <SubmissionsTab studentId={student.id} />)}
            </TabsContent>
            <TabsContent value="notes">
              {lazy("notes", <NotesTab studentId={student.id} canWriteNote={canWriteNote} />)}
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </View>
  );
}
