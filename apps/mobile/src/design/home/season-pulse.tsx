/**
 * How the season is going, in one card (always first on Home, owner
 * 2026-11-08): a ring for how far through it is, and beside it what is left
 * ("6 to go", "4 of 10 sessions held") so the two don't say the same thing
 * twice (owner, 2026-11-09); then the caller's figures in a row under a
 * hairline (staff: attendance and students; a student: absences left and
 * pending work). Opens the season, or the group, when the caller says where.
 */
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { iconWithClassName } from "../lib/icon";
import { usePressDim } from "../motion";
import { ProgressRing, RingCaption, RingValue } from "../ui/progress-ring";
import { Text } from "../ui/text";

iconWithClassName(ChevronRight);

/** A secondary figure: one equal column of the row under the ring. Its label may take two lines. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className="min-w-0 flex-1 gap-0.5">
      <Text variant="title" tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
      <Text
        variant="caption"
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
        className="text-muted-foreground"
      >
        {label}
      </Text>
    </View>
  );
}

export type PulseFigure = { value: string; label: string };

/** Staff figures: the cohort's mean attendance and its size. */
export function staffPulseFigures(attendancePct: number | null, students: number): PulseFigure[] {
  return [
    { value: attendancePct === null ? "—" : `${attendancePct}%`, label: "Attendance" },
    { value: String(students), label: students === 1 ? "Student" : "Students" },
  ];
}

export function SeasonPulse({
  title,
  subtitle,
  progressPct,
  sessionsHeld,
  sessionsTotal,
  figures,
  onPress,
}: {
  /** The season's or the group's name, on top of the card. */
  title: string;
  /** One line under the title, e.g. "Community-wide". */
  subtitle?: string;
  progressPct: number | null;
  sessionsHeld: number;
  sessionsTotal: number;
  figures: PulseFigure[];
  onPress?: () => void;
}) {
  const press = usePressDim();
  const pct = progressPct ?? 0;
  const toGo = Math.max(0, sessionsTotal - sessionsHeld);
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Open ${title}` : undefined}
      disabled={!onPress}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>
        <View testID="season-pulse" className="flex-col gap-3 rounded-group bg-surface p-4">
          <View className="flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1 gap-0.5">
              <Text variant="headline" numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? (
                <Text variant="subhead" className="text-muted-foreground">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {onPress ? <ChevronRight size={18} className="shrink-0 text-muted-foreground" /> : null}
          </View>
          <View className="flex-row items-center gap-4">
            <ProgressRing value={pct} size={112} strokeWidth={10} label={`Season progress ${pct}%`}>
              <RingValue>{`${pct}%`}</RingValue>
              <RingCaption className="normal-case tracking-normal">through</RingCaption>
            </ProgressRing>
            <View className="min-w-0 flex-1 gap-1">
              <View accessible accessibilityLabel={`Sessions held: ${sessionsHeld} of ${sessionsTotal}`} className="gap-0.5">
                {toGo > 0 ? (
                  <Text variant="largeTitle" tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {`${toGo}`}
                    <Text variant="title" className="text-muted-foreground">{" to go"}</Text>
                  </Text>
                ) : (
                  <Text variant="title" numberOfLines={2} maxFontSizeMultiplier={1.3}>
                    {sessionsTotal === 0 ? "No sessions yet" : "All sessions held"}
                  </Text>
                )}
                {sessionsTotal > 0 ? (
                  <Text variant="subhead" numberOfLines={2} maxFontSizeMultiplier={1.3} className="text-muted-foreground">
                    {`${sessionsHeld} of ${sessionsTotal} sessions held`}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
          {figures.length > 0 ? (
            <View className="flex-row items-stretch gap-3 border-t border-separator pt-3">
              {figures.map((f, i) => (
                <View key={f.label} className="min-w-0 flex-1 flex-row items-stretch gap-3">
                  {i > 0 ? <View className="w-px bg-separator" /> : null}
                  <Figure value={f.value} label={f.label} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}
