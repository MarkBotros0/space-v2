/**
 * Season progress on a student's page, for staff (spec 2026-11-12 "Progress for staff"): one card,
 * the three numbers each as a labelled bar with its percent and the exact figure under it, and
 * each opens its list (sessions, assignments, quizzes). Replaces the engagement "THIS SEASON"
 * card and, like it, shows no composite score (owner, 2026-11-07) and keeps "At risk" from the
 * engagement contract (C4, the single definition). A number with nothing to count says
 * "None this season" and has no bar, so it never reads as 0%. A 404 no_season shows nothing, as
 * before; a mentor or the student themself gets no card (mentor.md: nothing season-shaped).
 */
import type { PassingNumberKey } from "@space/shared";
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Pressable } from "../../design/ui/pressable";
import Animated from "react-native-reanimated";

import { InlineError } from "../../design/layout/route-states";
import { iconWithClassName } from "../../design/lib/icon";
import { usePressDim } from "../../design/motion";
import { Progress, Skeleton, StatusChip, Text } from "../../design/ui";
import { isNoSeasonError, useStudentEngagement } from "../../hooks/use-engagement";
import { useStudentProgress } from "../../hooks/use-season-passing";
import { useRole } from "../../store/session";
import { ProgressDetailSheet } from "./progress-detail-sheet";
import { type ProgressLine, progressLines, progressSpoken } from "./progress-model";

iconWithClassName(ChevronRight);

function LineButton({ line, onPress }: { line: ProgressLine; onPress: () => void }) {
  const press = usePressDim();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={progressSpoken(line)}
      accessibilityHint={`Opens the ${line.label.toLowerCase()} list`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>
        <View className="min-h-[44px] flex-col gap-1.5 py-2">
          <View className="flex-row items-center gap-2">
            <Text variant="body" className="min-w-0 flex-1 font-medium">
              {line.label}
            </Text>
            {line.pct !== null ? (
              <Text variant="headline" tabular className="shrink-0">
                {`${line.pct}%`}
              </Text>
            ) : null}
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </View>
          {line.pct !== null ? <Progress value={line.pct} label={line.label} /> : null}
          <Text variant="caption" className="text-muted-foreground">
            {line.figure}
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
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
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
      <View className="flex-col">
        {lines.map((line, i) => (
          <View key={line.key} className={i > 0 ? "border-t border-separator" : undefined}>
            <LineButton line={line} onPress={() => setOpen(line.key)} />
          </View>
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
