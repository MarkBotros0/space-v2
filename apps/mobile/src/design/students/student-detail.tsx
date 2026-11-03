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
import type { EnrollmentHistoryItem } from "@space/shared";
import { Mail, Phone } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Linking, ScrollView, View } from "react-native";

import type { StudentDetail as StudentDetailData } from "../../hooks/use-students";
import { initialsOf } from "../../lib/initials";
import { iconWithClassName } from "../lib/icon";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Text } from "../ui/text";
import { AttendanceTab, EngagementCard, SubmissionsTab } from "./student-activity-tabs";
import { NotesTab } from "./student-notes-tab";
import { ProfileTab, SeasonsTab } from "./student-profile-tabs";

iconWithClassName(Mail, Phone);

type Tab = "profile" | "seasons" | "attendance" | "submissions" | "notes";

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
          <ProfileTab profile={p} />
        </TabsContent>

        <TabsContent value="seasons">
          <SeasonsTab enrollments={student.enrollments} dropFor={dropFor} />
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
