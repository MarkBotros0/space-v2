/** student-detail's Profile and Seasons tabs, read straight off the detail payload. */
import { dateOnlyFromIso, type EnrollmentHistoryItem } from "@space/shared";
import { Calendar } from "lucide-react-native";
import { View } from "react-native";

import type { StudentDetail as StudentDetailData } from "../../hooks/use-students";
import { formatDate, formatDayKey } from "../../lib/format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Text } from "../ui/text";

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

/** Admin-only fields appear only when the arm the server sent carries them. */
export function ProfileTab({ profile: p }: { profile: StudentDetailData["profile"] }) {
  const phone = "phone" in p ? p.phone : null;
  const dateOfBirth =
    "dateOfBirth" in p && p.dateOfBirth ? formatDayKey(dateOnlyFromIso(p.dateOfBirth)) : null;
  const spiritual = "spiritualBackground" in p ? p.spiritualBackground : null;
  const internalNotes = "notes" in p ? p.notes : null;
  return (
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
  );
}

export function SeasonsTab({
  enrollments,
  dropFor,
}: {
  enrollments: EnrollmentHistoryItem[];
  dropFor?: (enrollment: EnrollmentHistoryItem) => (() => void) | null;
}) {
  return enrollments.length === 0 ? (
    <EmptyState
      icon={Calendar}
      title="No seasons"
      description="This student isn't enrolled in any season yet."
    />
  ) : (
    <View className="flex-col gap-3">
      {enrollments.map((e) => (
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
              <Button className="self-start" variant="ghost" size="sm" onPress={dropFor(e)!}>
                Drop
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </View>
  );
}
