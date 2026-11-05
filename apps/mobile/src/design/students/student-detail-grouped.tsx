/**
 * The student page body for a leader and a mentor (v1 leader/ and
 * mentor/students/[id]) in the redesign's grouped lists. Their payload carries
 * no phone, date of birth, spiritual background or internal notes (spec 06
 * D3/C8), so those fields are absent rather than "—"; each tab's data is
 * fetched the first time the tab opens (spec 06 §9). The tab row scrolls
 * sideways (five tabs overflow 360dp). `staffTabs={false}` is a student reading
 * their own record: Profile and Seasons only, as the staff endpoints refuse them.
 */
import { useState, type ComponentProps, type ReactNode } from "react";
import { Linking, ScrollView, View } from "react-native";

import { isNoSeasonError, useStudentEngagement } from "../../hooks/use-engagement";
import type { StudentDetail as StudentDetailData } from "../../hooks/use-students";
import { InlineError } from "../layout/route-states";
import { Button } from "../ui/button";
import { StatTile } from "../ui/stat-tile";
import { StatusChip } from "../ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  GroupedAttendanceTab,
  GroupedNotesTab,
  GroupedProfileTab,
  GroupedSeasonsTab,
  GroupedSubmissionsTab,
} from "./grouped-tabs";
import { NoteSheet } from "./note-sheet";

type Tab = "profile" | "seasons" | "attendance" | "submissions" | "notes";

/** v1 renders engagement only when the student has a current season: 404 no_season is no tiles. */
function EngagementTiles({ studentId }: { studentId: number }) {
  const q = useStudentEngagement(studentId, true);
  if (q.isPending || (q.isError && isNoSeasonError(q.error))) return null;
  if (q.isError)
    return <InlineError message="Couldn't load engagement." onRetry={() => void q.refetch()} />;
  const e = q.data;
  return (
    <View className="flex-col gap-3">
      {/* V2-ONLY: the single at-risk definition (C4). */}
      {e.atRisk ? <StatusChip tone="bad" label="At risk" /> : null}
      <View className="flex-row flex-wrap gap-3">
        <StatTile value={e.score} suffix="%" label="Score" />
        <StatTile
          value={e.attendancePct}
          suffix="%"
          label={`Attendance ${e.attendancePresent}/${e.attendanceTotal}`}
        />
        <StatTile
          value={e.submissionPct}
          suffix="%"
          label={`Submissions ${e.submissionsCompleted}/${e.submissionsExpected}`}
        />
      </View>
    </View>
  );
}

export function StudentDetailGrouped({
  student,
  canWriteNote,
  staffTabs = true,
  noteDefaultVisibility,
}: {
  student: StudentDetailData;
  canWriteNote: boolean;
  /** False for a student viewing their own page: no engagement, attendance, submissions or notes. */
  staffTabs?: boolean;
  /** Who a new note is visible to until the writer changes it. Omitted: NoteSheet's own default. */
  noteDefaultVisibility?: ComponentProps<typeof NoteSheet>["defaultVisibility"];
}) {
  const [tab, setTab] = useState<Tab>("profile");
  // A tab's queries mount the first time it opens and stay mounted (cache kept).
  const [opened, setOpened] = useState<Set<Tab>>(() => new Set<Tab>(["profile"]));
  // Always mounted, so a dismissed note keeps its text.
  const [noteOpen, setNoteOpen] = useState(false);
  const open = (t: string) => {
    setTab(t as Tab);
    setOpened((prev) => new Set(prev).add(t as Tab));
  };
  const lazy = (t: Tab, node: ReactNode) => (opened.has(t) ? node : null);
  const p = student.profile;
  const phone = "phone" in p ? p.phone : null;

  return (
    <View className="flex-col gap-4">
      <View className="flex-row flex-wrap gap-2">
        {student.graduationYear !== null ? (
          <StatusChip tone="ok" label={`Alumnus · ${student.graduationYear}`} />
        ) : null}
        {p.activeSeasonTitle ? <StatusChip tone="info" label={p.activeSeasonTitle} /> : null}
        {student.currentGroup ? <StatusChip tone="neutral" label={student.currentGroup.name} /> : null}
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="secondary"
          className="self-start"
          onPress={() => void Linking.openURL(`mailto:${student.email}`)}
        >
          Email
        </Button>
        {phone ? (
          <Button
            variant="secondary"
            className="self-start"
            onPress={() => void Linking.openURL(`tel:${phone}`)}
          >
            Call
          </Button>
        ) : null}
      </View>

      {staffTabs ? <EngagementTiles studentId={student.id} /> : null}

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
          <GroupedProfileTab profile={p} />
        </TabsContent>
        <TabsContent value="seasons">
          <GroupedSeasonsTab enrollments={student.enrollments} />
        </TabsContent>
        <TabsContent value="attendance">
          {lazy("attendance", <GroupedAttendanceTab studentId={student.id} />)}
        </TabsContent>
        <TabsContent value="submissions">
          {lazy("submissions", <GroupedSubmissionsTab studentId={student.id} />)}
        </TabsContent>
        <TabsContent value="notes">
          {lazy(
            "notes",
            <GroupedNotesTab
              studentId={student.id}
              canWriteNote={canWriteNote}
              onWrite={() => setNoteOpen(true)}
            />,
          )}
        </TabsContent>
      </Tabs>

      {canWriteNote ? (
        <NoteSheet
          open={noteOpen}
          onClose={() => setNoteOpen(false)}
          studentUserId={student.id}
          defaultVisibility={noteDefaultVisibility}
        />
      ) : null}
    </View>
  );
}
