import { useRouter } from "expo-router";
import { View } from "react-native";
import type { SeasonHistoryRow } from "@space/shared";

import { Button, HeroCard, StatusChip } from "../../design/ui";
import { outcomeChip } from "../past-season/season-overview";

/** The season that just ended: its result in words, and the way into its read-only page. */
export function FinishedSeasonCard({ row }: { row: SeasonHistoryRow }) {
  const router = useRouter();
  return (
    <HeroCard
      eyebrow="Your last season"
      title={`${row.title} finished`}
      action={
        <View className="flex-col items-start gap-3">
          <StatusChip {...outcomeChip(row.outcome, `${row.attendancePct}% attendance`)} />
          <Button
            variant="secondary"
            onPress={() =>
              router.push({ pathname: "/past-season/[seasonId]", params: { seasonId: String(row.seasonId) } })
            }
          >
            View your season
          </Button>
        </View>
      }
    />
  );
}
