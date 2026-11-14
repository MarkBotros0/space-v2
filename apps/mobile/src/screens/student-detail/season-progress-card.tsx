/**
 * Season progress on a student's page, for staff (spec 2026-11-12 "Progress for staff"): one card,
 * the three numbers as three rings side by side (owner 2026-11-14: "rings, more concise"), each
 * with its percent inside and its name and short figure under it, and each opens its list
 * (sessions, assignments, quizzes). Replaces the engagement "THIS SEASON"
 * card and, like it, shows no composite score (owner, 2026-11-07) and keeps "At risk" from the
 * engagement contract (C4, the single definition). A number with nothing to count says
 * "None yet", an empty ring with a dash, so it never reads as 0%. A 404 no_season shows nothing, as
 * before; a mentor or the student themself gets no card (mentor.md: nothing season-shaped).
 */
import type { PassingNumberKey } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";
import { Pressable } from "../../design/ui/pressable";
import Animated from "react-native-reanimated";

import { InlineError } from "../../design/layout/route-states";
import { usePressDim } from "../../design/motion";
import { Skeleton, StatusChip, Text } from "../../design/ui";
import { ProgressRing, RingValue } from "../../design/ui/progress-ring";
import { isNoSeasonError, useStudentEngagement } from "../../hooks/use-engagement";
import { useStudentProgress } from "../../hooks/use-season-passing";
import { progressBand } from "../../lib/progress-band";
import { useRole } from "../../store/session";
import { ProgressDetailSheet } from "./progress-detail-sheet";
import { type ProgressLine, progressLines, progressSpoken } from "./progress-model";

/** The ring's colour: teal on track, amber in the middle, red when low; never the only signal. */
const RING = { ok: "stroke-primary", warn: "stroke-warn", bad: "stroke-bad" } as const;

/** One number as a ring with its percent inside, the name and a short figure under it. */
function RingButton({ line, onPress }: { line: ProgressLine; onPress: () => void }) {
  const press = usePressDim();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={progressSpoken(line)}
      accessibilityHint={`Opens the ${line.label.toLowerCase()} list`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="min-w-0 flex-1"
    >
      <Animated.View style={press.animatedStyle}>
        <View className="items-center gap-1.5 py-1">
          <ProgressRing
            value={line.pct ?? 0}
            size={84}
            strokeWidth={8}
            indicatorClassName={line.pct === null ? undefined : RING[progressBand(line.pct)]}
          >
            <RingValue className="text-lg leading-6">{line.pct === null ? "–" : `${line.pct}%`}</RingValue>
          </ProgressRing>
          <Text variant="subhead" numberOfLines={1} className="font-semibold" maxFontSizeMultiplier={1.3}>
            {line.label}
          </Text>
          <Text variant="caption" numberOfLines={1} className="text-muted-foreground" maxFontSizeMultiplier={1.3}>
            {line.short}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function LoadingCard() {
  return (
    <View testID="season-progress-loading" className="flex-col gap-3 rounded-group bg-surface p-4">
      <Skeleton className="w-1/2" height={20} />
      <View className="flex-row justify-around">
        <Skeleton width={84} height={84} radius={42} />
        <Skeleton width={84} height={84} radius={42} />
        <Skeleton width={84} height={84} radius={42} />
      </View>
    </View>
  );
}

export function SeasonProgressCard({ studentId, studentName }: { studentId: number; studentName: string }) {
  const role = useRole();
  const staff = role === "LEADER" || role === "ADMIN" || role === "SUPER";
  const q = useStudentProgress(staff ? studentId : null);
  // Only for the "At risk" chip: the card stands without it.
  const engagement = useStudentEngagement(studentId, staff);
  const [open, setOpen] = useState<PassingNumberKey | null>(null);

  if (!staff || (q.isError && isNoSeasonError(q.error))) return null;
  if (q.isPending) return <LoadingCard />;
  // A failed background refresh keeps the figures it had.
  if (!q.data) return <InlineError message="Couldn't load season progress." onRetry={() => void q.refetch()} />;

  const p = q.data;
  const lines = progressLines(p);
  return (
    <View testID="season-progress" className="flex-col gap-2 rounded-group bg-surface p-4">
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1">
          <Text variant="headline">Season progress</Text>
          <Text variant="caption" className="text-muted-foreground">
            {p.seasonTitle}
          </Text>
        </View>
        <View className="shrink-0 flex-row flex-wrap justify-end gap-1.5">
          {engagement.data?.atRisk ? <StatusChip tone="bad" label="At risk" /> : null}
          {p.seasonActive ? null : <StatusChip tone="neutral" label="Ended" />}
        </View>
      </View>
      <View className="flex-row gap-2 pt-2">
        {lines.map((line) => (
          <RingButton key={line.key} line={line} onPress={() => setOpen(line.key)} />
        ))}
      </View>
      <ProgressDetailSheet
        progress={p}
        view={open}
        studentId={studentId}
        studentName={studentName}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}
