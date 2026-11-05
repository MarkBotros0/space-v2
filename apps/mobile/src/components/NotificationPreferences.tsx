// apps/mobile/src/components/NotificationPreferences.tsx
import { useState } from "react";
import { View } from "react-native";
import type { NotificationPreferences as Prefs } from "@space/shared";

import { Section } from "../design/settings/section";
import { Button, Skeleton, Switch, Text } from "../design/ui";
import { GroupedList, ListRow, ListSectionHeader } from "../design/ui/grouped-list";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "../hooks/use-notifications";
import { enablePush, type PushStatus } from "../lib/push";
import { useSessionStore } from "../store/session";

/**
 * v1 settings-form.tsx's Notifications section — nine rows, not v1's five.
 *
 * The labels are keyed off the preference column names so a key that exists in
 * the contract but not here is a compile error (`Record<keyof Prefs, ...>`),
 * which is the UI half of the fix for R56/R57. Copy is v1's except the
 * low-attendance count (spec D12) and the four rows v1 never had (quiz graded,
 * quiz published, submission received, session cancelled).
 */
const LABELS: Record<keyof Prefs, { label: string; help: string }> = {
  assignmentCreated: {
    label: "New assignments",
    help: "When an admin creates an assignment you're targeted by.",
  },
  submissionReviewed: {
    label: "Submission reviewed",
    help: "When a leader leaves feedback on your submission.",
  },
  sessionRescheduled: {
    label: "Session rescheduled",
    help: "When a session you're enrolled in moves time.",
  },
  quizGraded: {
    label: "Quiz graded",
    help: "When a quiz you took has been graded.",
  },
  quizPublished: {
    label: "New quizzes",
    help: "When an online quiz opens in your season.",
  },
  sessionCancelled: {
    label: "Session cancelled",
    help: "When an upcoming session in your season is cancelled.",
  },
  submissionReceived: {
    label: "Submissions received",
    help: "When a student in a group you lead submits their work.",
  },
  lowAttendanceFlag: {
    label: "Low-attendance flags",
    // Spec D12: v1's copy said three. The rule is two.
    help: "When a student you lead/admin misses two in a row.",
  },
  mentorFollowup: {
    label: "Mentor follow-ups",
    help: "When a mentor flags a note for admin follow-up.",
  },
};

// Student-facing first, then the staff ones.
const ORDER: (keyof Prefs)[] = [
  "assignmentCreated",
  "submissionReviewed",
  "quizPublished",
  "quizGraded",
  "sessionRescheduled",
  "sessionCancelled",
  "submissionReceived",
  "lowAttendanceFlag",
  "mentorFollowup",
];

/** One honest sentence per push state. */
const PUSH_COPY: Record<PushStatus | "idle", string> = {
  idle: "Get alerted on this phone for anything you get notified about. The switches below choose which.",
  registered: "Push is on for this device.",
  unavailable: "Push isn't available on the server right now. Try again later.",
  denied: "Notifications are off for JPC Space in your phone's settings.",
  not_configured: "Push isn't set up for this build of the app yet.",
  failed: "Couldn't set up push. Try again.",
};

export function NotificationPreferences() {
  const pushToken = useSessionStore((s) => s.pushToken);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [enabling, setEnabling] = useState(false);
  const { data, isPending, isError, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  const toggle = (key: keyof Prefs, value: boolean) => {
    if (!data) return;
    // PUT replaces every key: there is no partial form of this contract, which
    // is exactly what stops a client from leaving a key at its default without
    // saying so.
    update.mutate({ ...data, [key]: value });
  };

  return (
    <>
      <View className="flex-col gap-2">
        <ListSectionHeader>Notifications</ListSectionHeader>
        {isPending ? (
          <View accessible accessibilityLabel="Loading" className="flex-col gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </View>
        ) : isError || !data ? (
          <View className="flex-col items-start gap-2 rounded-group bg-surface p-4">
            <Text className="text-sm text-error-600 dark:text-error-400">
              Couldn't load your notification settings.
            </Text>
            <Button variant="outline" size="sm" onPress={() => void refetch()}>
              Try again
            </Button>
          </View>
        ) : (
          <GroupedList>
            {ORDER.map((key) => (
              <ListRow
                key={key}
                title={LABELS[key].label}
                subtitle={LABELS[key].help}
                subtitleLines={3}
                trailing={
                  <Switch
                    accessibilityLabel={LABELS[key].label}
                    checked={data[key]}
                    onCheckedChange={(value) => toggle(key, value)}
                    className={update.isPending ? "opacity-70" : undefined}
                  />
                }
              />
            ))}
          </GroupedList>
        )}
        {/* Spec D4: the inbox row is always written; the switch governs the
            outbound channels. Saying so is the difference between a setting
            and a surprise. */}
        <Text variant="caption" className="px-4 text-muted-foreground">
          Changes save automatically. Turning one off stops the emails and push for that kind of notification. They will
          still appear in your inbox — that is your history.
        </Text>
      </View>
      <Section title="Push notifications" description="Alerts on this device.">
        <View className="flex-col items-start gap-3">
          <Text className="text-sm text-muted-foreground">
            {PUSH_COPY[pushStatus ?? (pushToken ? "registered" : "idle")]}
          </Text>
          <Button
            variant="outline"
            disabled={enabling || pushToken !== null}
            onPress={() => {
              setEnabling(true);
              void enablePush()
                .then(({ status }) => setPushStatus(status))
                .finally(() => setEnabling(false));
            }}
          >
            {pushToken ? "Push enabled on this device" : "Enable push notifications"}
          </Button>
        </View>
      </Section>
    </>
  );
}
