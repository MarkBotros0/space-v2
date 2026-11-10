/**
 * A student's page as their mentor sees it (owner, 2026-11-07): nothing
 * season-shaped. The alumnus chip, Follow up, the details (the phone row calls),
 * then Notes (first, open) and Attendance across every season, grouped by
 * season. No This season card, no figures, no Submissions or Seasons tabs.
 */
import { classLabel } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";

import { GroupedAttendanceTab, GroupedNotesTab } from "../student-detail/grouped-tabs";
import { NoteSheet } from "../student-detail/note-sheet";
import { StudentDetails } from "../student-detail/student-details";
import { type StudentSection, StudentSections } from "../student-detail/student-sections";
import { StatusChip } from "../../design/ui/status-chip";
import type { StudentDetail } from "../../hooks/use-students";
import { FollowUpCard } from "./follow-up-card";

export function MentorStudentPage({ student }: { student: StudentDetail }) {
  // Always mounted, so a dismissed note keeps its text.
  const [noteOpen, setNoteOpen] = useState(false);
  const sections: StudentSection[] = [
    {
      value: "notes",
      label: "Notes",
      render: () => (
        <GroupedNotesTab studentId={student.id} canWriteNote seasonless onWrite={() => setNoteOpen(true)} />
      ),
    },
    {
      value: "attendance",
      label: "Attendance",
      render: () => <GroupedAttendanceTab studentId={student.id} bySeason />,
    },
  ];
  return (
    <View className="flex-col gap-6">
      {student.graduationYear !== null ? (
        <StatusChip tone="ok" label={`Alumnus · ${classLabel(student.graduationYear)}`} className="self-start" />
      ) : null}
      <FollowUpCard studentId={student.id} studentName={student.name} />
      <StudentDetails profile={student.profile} canCall />
      <StudentSections sections={sections} />
      <NoteSheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        studentUserId={student.id}
        defaultVisibility="MENTORS"
      />
    </View>
  );
}
