import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { AttendanceRosterRow, AttendanceStatus } from "@space/shared";

import { useAttendanceRoster, useSaveAttendance } from "../../../../src/hooks/use-attendance";
import {
  buildAttendanceEntries,
  type AttendanceMarks,
  type LateMinutesText,
} from "../../../../src/lib/attendance-entries";
import { useTheme } from "../../../../src/theme";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  Text,
} from "../../../../src/ui";

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
];

function RosterRow({
  row,
  current,
  lateText,
  onMark,
  onLateText,
}: {
  row: AttendanceRosterRow;
  current: AttendanceStatus | null;
  lateText: string;
  onMark: (status: AttendanceStatus) => void;
  onLateText: (text: string) => void;
}) {
  const theme = useTheme();
  const displayName = row.name ?? row.email;

  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <Text variant="heading">{displayName}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {row.groupName ? `${row.groupName} · ${row.email}` : row.email}
      </Text>
      <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
        {STATUSES.map((option) => {
          const active = current === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${displayName} ${option.value}`}
              accessibilityState={{ selected: active }}
              onPress={() => onMark(option.value)}
              style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radii.md,
                borderWidth: theme.borderWidths.thin,
                borderColor: active ? theme.colors.neutral[900] : theme.colors.neutral[300],
                backgroundColor: active ? theme.colors.neutral[100] : theme.colors.white,
              }}
            >
              <Text variant="label">{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {current === "LATE" ? (
        <Input
          label={`Minutes late for ${displayName}`}
          value={lateText}
          onChangeText={onLateText}
          keyboardType="number-pad"
        />
      ) : null}
    </Card>
  );
}

export default function AttendanceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const sessionId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data: roster, isPending, isError, refetch } = useAttendanceRoster(sessionId);
  const save = useSaveAttendance(sessionId ?? 0);
  const [marks, setMarks] = useState<AttendanceMarks>({});
  const [lateText, setLateText] = useState<LateMinutesText>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (sessionId === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That session link isn't valid." />
      </Screen>
    );
  }

  const markAll = (status: AttendanceStatus) =>
    setMarks(Object.fromEntries((roster ?? []).map((row) => [row.studentUserId, status])));

  const onSave = () => {
    setFormError(null);
    const entries = buildAttendanceEntries(roster ?? [], marks, lateText);
    if (entries.length === 0) {
      setFormError("Mark at least one student before saving.");
      return;
    }
    save.mutate(entries, { onSuccess: () => router.back() });
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="title">Attendance</Text>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load the roster." onRetry={refetch} />
      ) : roster.length === 0 ? (
        <EmptyState title="No students" message="No students are enrolled in this scope." />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginVertical: theme.spacing.md }}>
            {STATUSES.map((option) => (
              <Button
                key={option.value}
                title={`All ${option.label.toLowerCase()}`}
                variant="secondary"
                onPress={() => markAll(option.value)}
              />
            ))}
          </View>
          {roster.map((row) => (
            <RosterRow
              key={row.studentUserId}
              row={row}
              current={marks[row.studentUserId] ?? row.status}
              lateText={lateText[row.studentUserId] ?? (row.lateMinutes !== null ? String(row.lateMinutes) : "")}
              onMark={(status) => setMarks((prev) => ({ ...prev, [row.studentUserId]: status }))}
              onLateText={(text) => setLateText((prev) => ({ ...prev, [row.studentUserId]: text }))}
            />
          ))}
          {formError ? (
            <Text variant="caption" color={theme.colors.error[700]}>
              {formError}
            </Text>
          ) : null}
          {save.isError ? (
            <Text variant="caption" color={theme.colors.error[700]}>
              Couldn't save attendance. Check your connection and try again.
            </Text>
          ) : null}
          <Button title="Save attendance" onPress={onSave} loading={save.isPending} />
        </>
      )}
    </Screen>
  );
}
