// apps/mobile/src/components/NotificationPreferences.tsx
import { useState } from "react";
import { Switch, View } from "react-native";
import type { NotificationPreferences as Prefs } from "@space/shared";

import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../hooks/use-notifications";
import { enablePush, type PushStatus } from "../lib/push";
import { useSessionStore } from "../store/session";
import { useTheme } from "../theme";
import { Button, Card, ErrorState, LoadingState, Text } from "../ui";

/**
 * One row per notification type — six, not v1's five.
 *
 * The labels are keyed off the preference column names so a key that exists in
 * the contract but not here is a compile error (`Record<keyof Prefs, ...>`),
 * which is the UI half of the fix for R56/R57.
 */
const LABELS: Record<keyof Prefs, { label: string; help: string }> = {
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
  quizGraded: {
    label: "Quiz graded",
    help: "When a quiz you took has been graded.",
  },
};

const ORDER: (keyof Prefs)[] = [
  "assignmentCreated",
  "submissionReviewed",
  "sessionRescheduled",
  "quizGraded",
  "lowAttendanceFlag",
  "mentorFollowup",
];

/** One honest sentence per push state. Names the three types that would push
 *  (PUSH_NOTIFICATION_TYPES) rather than promising all six. */
const PUSH_COPY: Record<PushStatus | "idle", string> = {
  idle: "Get alerted when a session moves, or when your work or a quiz is graded.",
  registered: "Push is on for this device.",
  unavailable: "This device is ready for push. Delivery switches on when the server migration lands.",
  denied: "Notifications are off for JPC Space in your phone's settings.",
  not_configured: "Push isn't set up for this build of the app yet.",
  failed: "Couldn't set up push. Try again.",
};

export function NotificationPreferences() {
  const theme = useTheme();
  const pushToken = useSessionStore((s) => s.pushToken);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [enabling, setEnabling] = useState(false);
  const { data, isPending, isError, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  if (isPending) return <LoadingState />;
  if (isError) {
    return <ErrorState message="Couldn't load your notification settings." onRetry={refetch} />;
  }

  const toggle = (key: keyof Prefs, value: boolean) => {
    // PUT replaces all six: there is no partial form of this contract, which
    // is exactly what stops a client from leaving a key at its default without
    // saying so.
    update.mutate({ ...data, [key]: value });
  };

  return (
    <Card>
      <Text variant="heading">Notifications</Text>
      <Text variant="body" color={theme.colors.neutral[600]}>
        Turning one off stops the emails and push for that kind of notification. They will still
        appear in your inbox — that is your history.
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
            disabled={update.isPending}
          />
        </View>
      ))}
      <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}>
        <Text variant="body">Push notifications</Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {PUSH_COPY[pushStatus ?? (pushToken ? "unavailable" : "idle")]}
        </Text>
        <Button
          title={pushToken ? "Push enabled on this device" : "Enable push notifications"}
          variant="secondary"
          loading={enabling}
          disabled={pushToken !== null}
          onPress={() => {
            setEnabling(true);
            void enablePush()
              .then(({ status }) => setPushStatus(status))
              .finally(() => setEnabling(false));
          }}
        />
      </View>
    </Card>
  );
}
