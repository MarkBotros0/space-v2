/**
 * How the season is going, in one card: a ring for how far through it is,
 * "4 of 10" sessions held beside it, and the caller's figures under that
 * (staff: attendance and students; a student: their absence budget, streak and
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

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className="gap-0.5">
      <Text variant="title" tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
      <Text
        variant="caption"
        numberOfLines={1}
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
  progressPct,
  sessionsHeld,
  sessionsTotal,
  figures,
  onPress,
}: {
  /** The season's or the group's name, on top of the card. */
  title: string;
  progressPct: number | null;
  sessionsHeld: number;
  sessionsTotal: number;
  figures: PulseFigure[];
  onPress?: () => void;
}) {
  const press = usePressDim();
  const pct = progressPct ?? 0;
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
            <Text variant="headline" numberOfLines={2} className="min-w-0 flex-1">
              {title}
            </Text>
            {onPress ? <ChevronRight size={18} className="shrink-0 text-muted-foreground" /> : null}
          </View>
          <View className="flex-row items-center gap-5">
            <ProgressRing value={pct} label={`Season progress ${pct}%`}>
              <RingValue>{`${pct}%`}</RingValue>
              <RingCaption>Through</RingCaption>
            </ProgressRing>
            <View className="min-w-0 flex-1 gap-3">
              <Figure value={`${sessionsHeld} of ${sessionsTotal}`} label="Sessions held" />
              <View className="flex-row flex-wrap gap-x-6 gap-y-3">
                {figures.map((f) => (
                  <Figure key={f.label} value={f.value} label={f.label} />
                ))}
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
