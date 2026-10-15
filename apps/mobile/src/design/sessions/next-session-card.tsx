/**
 * v1's "Next session" card, identical on the student and leader dashboards:
 * eyebrow, teal dot + title link, org date line, relative badge, and the
 * stream link only while the session runs (spec 19 D13).
 */
import type { DashboardSession } from "@space/shared";
import { Linking, Pressable, View } from "react-native";

import { formatTimeAgo, formatWallTime, formatWeekdayDay } from "../../lib/format";
import { Eyebrow } from "../layout/page-title";
import { shadowStyle } from "../lib/shadow";
import { Badge } from "../ui/badge";
import { Text } from "../ui/text";

export function NextSessionCard({
  session: next,
  onOpen,
}: {
  session: DashboardSession | null;
  onOpen: (id: number) => void;
}) {
  return (
    <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
      <Eyebrow>{next?.isInProgress ? "Happening now" : "Next session"}</Eyebrow>
      {next ? (
        <View className="mt-2 flex-col gap-2">
          <View className="flex-row items-start gap-3">
            <View className="mt-1 size-2 shrink-0 rounded-full bg-brand-teal-500" />
            <View className="min-w-0 flex-1 items-start">
              <Pressable accessibilityRole="link" onPress={() => onOpen(next.id)}>
                <Text className="text-sm font-bold text-brand-navy-900 dark:text-foreground">{next.title}</Text>
              </Pressable>
              <Text className="text-xs text-muted-foreground">
                {`${formatWeekdayDay(next.dayKey)} · ${formatWallTime(next.time)} · ${next.durationMinutes} min${
                  next.location ? ` · ${next.location}` : ""
                }`}
              </Text>
              {next.isInProgress ? null : (
                <Badge variant="teal" className="mt-1.5" textClassName="text-[10px]">
                  {formatTimeAgo(next.startsAt)}
                </Badge>
              )}
            </View>
          </View>
          {/* D13: a stream link only while the session is running; never "Watch recording" on a future one. */}
          {next.isInProgress && next.youtubeUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(next.youtubeUrl ?? "")}
              className="items-center justify-center rounded-lg bg-brand-teal-600 px-3 py-2 active:bg-brand-teal-700"
            >
              <Text className="text-xs font-bold text-white">Join stream</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text className="mt-2 text-sm italic text-muted-foreground">No upcoming sessions.</Text>
      )}
    </View>
  );
}
