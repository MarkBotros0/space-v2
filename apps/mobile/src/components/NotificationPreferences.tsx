// apps/mobile/src/components/NotificationPreferences.tsx
import { useState } from "react";
import { View } from "react-native";
import type { NotificationPreferences as Prefs, UserRole } from "@space/shared";

import { Section } from "../design/settings/section";
import { Button, Skeleton, Switch, Text } from "../design/ui";
import { GroupedList, ListRow, ListSectionHeader } from "../design/ui/grouped-list";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "../hooks/use-notifications";
import { enablePush, type PushStatus } from "../lib/push";
import { useSessionStore, useRole } from "../store/session";

type ShownKey = keyof Prefs;

/**
 * v1 settings-form.tsx's Notifications section.
 *
 * The labels are keyed off the preference column names so a key that exists in
 * the contract but not here is a compile error (`Record<ShownKey, ...>`),
 * which is the UI half of the fix for R56/R57. Copy is v1's except the
 * low-attendance count (spec D12) and the four rows v1 never had (quiz graded,
 * quiz published, submission received, session cancelled).
 */
const LABELS: Record<ShownKey, { label: string; help: string }> = {
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
  mentorFollowup: {
    label: "Follow-up reminders",
    help: "A week after you flag a student to follow up with.",
  },
  lowAttendanceFlag: {
    label: "Low-attendance flags",
    // Spec D12: v1's copy said three. The rule is two.
    help: "When a student you lead/admin misses two in a row.",
  },
  announcement: {
    label: "New announcements",
    help: "When an admin or super posts an announcement to you or your season.",
  },
};

/** What a student is sent: their work, their quizzes, their sessions. */
const STUDENT_KEYS: ShownKey[] = [
  "assignmentCreated",
  "submissionReviewed",
  "quizPublished",
  "quizGraded",
  "sessionRescheduled",
  "sessionCancelled",
  "announcement",
];

/**
 * Only the switches for notifications this person can get (owner, 2026-11-07): a
 * student's six; a group leader's handed-in work and low-attendance flags; a
 * season admin's low-attendance flags; a mentor's follow-up reminders (owner,
 * 2026-11-07). Everyone also gets New announcements, last; for SUPER it is the only switch.
 */
function preferenceKeysFor(
  role: UserRole | null,
  scopes: { seasonAdminIds: number[]; groupLeaderIds: number[] } | null,
): ShownKey[] {
  if (role === "STUDENT") return STUDENT_KEYS;
  if (role === "MENTOR") return ["mentorFollowup", "announcement"];
  const keys: ShownKey[] = [];
  if (scopes && scopes.groupLeaderIds.length > 0) keys.push("submissionReceived");
  if (scopes && (scopes.groupLeaderIds.length > 0 || scopes.seasonAdminIds.length > 0)) keys.push("lowAttendanceFlag");
  // Everyone, Super included, is sent announcements.
  keys.push("announcement");
  return keys;
}

/** One honest sentence per push state. */
const PUSH_COPY: Record<PushStatus | "idle", string> = {
  idle: "Turn on push to get alerts on this phone. Then choose what you're notified about.",
  registered: "Push is on for this device.",
  unavailable: "Push isn't available on the server right now. Try again later.",
  denied: "Notifications are off for JPC Space in your phone's settings.",
  not_configured: "Push isn't set up for this build of the app yet.",
  failed: "Couldn't set up push. Try again.",
};

export function NotificationPreferences() {
  const pushToken = useSessionStore((s) => s.pushToken);
  const role = useRole();
  const scopes = useSessionStore((s) => s.scopes);
  const keys = preferenceKeysFor(role, scopes);
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

  // Owner, 2026-11-06: the per-kind switches stay hidden until push is on for
  // this phone — first the one decision (turn alerts on), then the detail.
  const pushOn = pushToken !== null;

  return (
    <View className="flex-col gap-6">
      <Section title="Push notifications" description="Alerts on this device.">
        <View className="flex-col items-start gap-3">
          <Text className="text-sm text-muted-foreground">
            {PUSH_COPY[pushStatus ?? (pushOn ? "registered" : "idle")]}
          </Text>
          <Button
            variant={pushOn ? "secondary" : "primary"}
            disabled={enabling || pushOn}
            onPress={() => {
              setEnabling(true);
              void enablePush()
                .then(({ status }) => setPushStatus(status))
                .finally(() => setEnabling(false));
            }}
          >
            {/* Button labels are one line: the long forms ended in an ellipsis at 1.3x on a 360dp phone. */}
            {pushOn ? "Push enabled" : enabling ? "Enabling…" : "Enable push"}
          </Button>
        </View>
      </Section>
      {pushOn ? (
        <View className="flex-col gap-2">
          <ListSectionHeader>What you're notified about</ListSectionHeader>
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
              <Button variant="secondary" size="sm" onPress={() => void refetch()}>
                Try again
              </Button>
            </View>
          ) : (
            <GroupedList>
              {keys.map((key) => (
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
            Changes save automatically. Turning one off stops the push notifications for that kind. They will still
            appear in your inbox — that is your history.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
