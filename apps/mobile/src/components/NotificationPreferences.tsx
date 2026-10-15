// apps/mobile/src/components/NotificationPreferences.tsx
import { Bell, Smartphone } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import type { NotificationPreferences as Prefs } from "@space/shared";

import { cn } from "../design/lib/cn";
import { Section } from "../design/settings/section";
import { Button, Skeleton, Switch, Text } from "../design/ui";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "../hooks/use-notifications";
import { enablePush, type PushStatus } from "../lib/push";
import { useSessionStore } from "../store/session";

/**
 * v1 settings-form.tsx's Notifications section — six rows, not v1's five.
 *
 * The labels are keyed off the preference column names so a key that exists in
 * the contract but not here is a compile error (`Record<keyof Prefs, ...>`),
 * which is the UI half of the fix for R56/R57. Copy is v1's except the
 * low-attendance count (spec D12) and the sixth row v1 never had.
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
  const pushToken = useSessionStore((s) => s.pushToken);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [enabling, setEnabling] = useState(false);
  const { data, isPending, isError, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  const toggle = (key: keyof Prefs, value: boolean) => {
    if (!data) return;
    // PUT replaces all six: there is no partial form of this contract, which
    // is exactly what stops a client from leaving a key at its default without
    // saying so.
    update.mutate({ ...data, [key]: value });
  };

  return (
    <>
      <Section icon={Bell} title="Notifications" description="Changes save automatically.">
        {/* Spec D4: the inbox row is always written; the switch governs the
            outbound channels. Saying so is the difference between a setting
            and a surprise. */}
        <Text className="mb-3 text-xs text-muted-foreground">
          Turning one off stops the emails and push for that kind of notification. They will still appear in your
          inbox — that is your history.
        </Text>
        {isPending ? (
          <View accessible accessibilityLabel="Loading" className="flex-col gap-3">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </View>
        ) : isError || !data ? (
          <View className="flex-col items-start gap-2">
            <Text className="text-sm text-error-600 dark:text-error-400">
              Couldn't load your notification settings.
            </Text>
            <Button variant="outline" size="sm" onPress={() => void refetch()}>
              Try again
            </Button>
          </View>
        ) : (
          <View className="flex-col">
            {ORDER.map((key, i) => (
              <View
                key={key}
                className={cn(
                  "flex-row items-center justify-between gap-4 py-3",
                  i > 0 && "border-t border-border",
                  i === 0 && "pt-0",
                  i === ORDER.length - 1 && "pb-0",
                )}
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-medium text-foreground">{LABELS[key].label}</Text>
                  <Text className="text-xs text-muted-foreground">{LABELS[key].help}</Text>
                </View>
                <Switch
                  accessibilityLabel={LABELS[key].label}
                  checked={data[key]}
                  onCheckedChange={(value) => toggle(key, value)}
                  className={update.isPending ? "opacity-70" : undefined}
                />
              </View>
            ))}
          </View>
        )}
      </Section>
      <Section icon={Smartphone} title="Push notifications" description="Alerts on this device.">
        <View className="flex-col items-start gap-3">
          <Text className="text-sm text-muted-foreground">
            {PUSH_COPY[pushStatus ?? (pushToken ? "unavailable" : "idle")]}
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
