// apps/mobile/src/components/NotificationPreferences.tsx
import { Switch, View } from "react-native";
import type { NotificationPreferencesUpdate } from "@space/shared";

import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../hooks/use-notifications";
import { useTheme } from "../theme";
import { Card, ErrorState, LoadingState, Text } from "../ui";

/**
 * One row per settable type — v1's five (settings-page.tsx:7-13). `quizGraded`
 * is stored but not settable in v1, so it has no row (R56/R57, 18-settings R15).
 *
 * Keyed off the update contract, so a settable key without a row is a compile
 * error (`Record<SettableKey, ...>`).
 */
type SettableKey = keyof NotificationPreferencesUpdate;

const LABELS: Record<SettableKey, { label: string; help: string }> = {
  assignmentCreated: {
    label: "Assignment created",
    help: "When new work is set for you.",
  },
  submissionReviewed: {
    label: "Submission reviewed",
    help: "When a leader records feedback on your work.",
  },
  sessionRescheduled: {
    label: "Session rescheduled",
    help: "When a session in your season moves.",
  },
  lowAttendanceFlag: {
    label: "Low attendance flag",
    // Spec D12: v1's copy said three. The rule is two.
    help: "When a student in your group misses two consecutive sessions.",
  },
  mentorFollowup: {
    label: "Mentor follow-up",
    help: "When a mentor flags a student for follow-up.",
  },
};

const ORDER: SettableKey[] = [
  "assignmentCreated",
  "submissionReviewed",
  "sessionRescheduled",
  "lowAttendanceFlag",
  "mentorFollowup",
];

export function NotificationPreferences() {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  if (isPending) return <LoadingState />;
  if (isError) {
    return <ErrorState message="Couldn't load your notification settings." onRetry={refetch} />;
  }

  const toggle = (key: SettableKey, value: boolean) => {
    // PUT carries v1's five keys and has no partial form; quizGraded is never
    // sent (R56) and the server leaves it untouched.
    const { quizGraded: _notSettable, ...settable } = data;
    update.mutate({ ...settable, [key]: value });
  };

  return (
    <Card>
      <Text variant="heading">Notifications</Text>
      <Text variant="body" color={theme.colors.neutral[600]}>
        Turning one off stops that kind of notification entirely — not in your inbox, not by
        email.
      </Text>
      {ORDER.map((key) => (
        <View
          key={key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Text variant="body">{LABELS[key].label}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {LABELS[key].help}
            </Text>
          </View>
          <Switch
            accessibilityLabel={LABELS[key].label}
            value={data[key]}
            onValueChange={(value) => toggle(key, value)}
          />
        </View>
      ))}
    </Card>
  );
}
