/**
 * The student page body for a leader and a mentor (v1 leader/ and
 * mentor/students/[id]), and a student reading their own record. Top to
 * bottom (owner, 2026-11-07): the alumnus chip when there is one, this season
 * in one card (Season progress), the details that are filled in, then the sections
 * behind choice chips. Their payload carries the phone but no date of birth or
 * internal notes (spec 06 D3/C8), so those rows are absent. `staffTabs={false}`
 * is the student's own view: Seasons only, as the staff endpoints refuse the rest.
 */
import { classLabel } from "@space/shared";
import { useState, type ComponentProps } from "react";
import { View } from "react-native";

import type { StudentDetail as StudentDetailData } from "../../hooks/use-students";
import { StatusChip } from "../../design/ui/status-chip";
import { GroupedAttendanceTab, GroupedNotesTab, GroupedSeasonsTab } from "./grouped-tabs";
import { NoteSheet } from "./note-sheet";
import { SeasonProgressCard } from "./season-progress-card";
import { StudentDetails } from "./student-details";
import { type StudentSection, StudentSections } from "./student-sections";
import { StudentWorkTab } from "./work-tab";

export function StudentDetailGrouped({
  student,
  canWriteNote,
  staffTabs = true,
  noteDefaultVisibility,
}: {
  student: StudentDetailData;
  canWriteNote: boolean;
  /** False for a student viewing their own page: no season progress, work, attendance or notes. */
  staffTabs?: boolean;
  /** Who a new note is visible to until the writer changes it. Omitted: NoteSheet's own default. */
  noteDefaultVisibility?: ComponentProps<typeof NoteSheet>["defaultVisibility"];
}) {
  // Always mounted, so a dismissed note keeps its text.
  const [noteOpen, setNoteOpen] = useState(false);
  // Owner 2026-11-14: Work (assignments and quizzes, the essay inside its assignment) first, then
  // Attendance, Notes and Seasons; the first opens.
  const seasons: StudentSection = {
    value: "seasons",
    label: "Seasons",
    render: () => <GroupedSeasonsTab enrollments={student.enrollments} />,
  };
  const sections: StudentSection[] = staffTabs
    ? [
        {
          value: "work",
          label: "Work",
          render: () => <StudentWorkTab studentId={student.id} studentName={student.name} />,
        },
        { value: "attendance", label: "Attendance", render: () => <GroupedAttendanceTab studentId={student.id} /> },
        {
          value: "notes",
          label: "Notes",
          render: () => (
            <GroupedNotesTab studentId={student.id} canWriteNote={canWriteNote} onWrite={() => setNoteOpen(true)} />
          ),
        },
        seasons,
      ]
    : [seasons];

  return (
    <View className="flex-col gap-6">
      {student.graduationYear !== null ? (
        <StatusChip tone="ok" label={`Alumnus · ${classLabel(student.graduationYear)}`} className="self-start" />
      ) : null}
      {staffTabs ? <SeasonProgressCard studentId={student.id} studentName={student.name} /> : null}
      <StudentDetails profile={student.profile} canCall={staffTabs} />
      <StudentSections sections={sections} />

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

/** The page subtitle: the student's current group, never their email (owner, 2026-11-07). */
export function studentSubtitle(student: Pick<StudentDetailData, "currentGroup">): string | undefined {
  return student.currentGroup?.name ?? undefined;
}
