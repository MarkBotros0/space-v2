/**
 * Which season the report shows, at the top of Reports, with History for the
 * others (owner, 2026-11-07): it opens on the current season, and History lists
 * the rest, current first, then past seasons newest first. SUPER and MENTOR
 * also get All seasons there.
 */
import { isSeasonFinished } from "@space/shared";
import { useRouter } from "expo-router";
import { Check, ChevronsUpDown } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import Animated from "react-native-reanimated";
import { View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
import { usePressDim } from "../../design/motion";
import { Pressable } from "../../design/ui/pressable";
import { GroupedList, ListRow, PillButton, Sheet, StatusChip, statusChip, Text } from "../../design/ui";
import { formatSeasonDay } from "../../lib/format";
import { isCurrentSeason, type ReportSeason } from "./default-season";

iconWithClassName(Check, ChevronsUpDown);

function seasonLine(s: ReportSeason): string {
  if (s.status === "ACTIVE") return "Running now";
  if (s.status === "DRAFT") return "Not started yet";
  return `Ended ${formatSeasonDay(s.endDate)}`;
}

/**
 * The season part of the card. With a choice it is one button (owner 2026-11-14: "make it clearer
 * that the card is clickable"): "Showing" over the season, and a Change pill with an up-down chevron, the picker's own sign.
 */
function SeasonPick({ title, onPress, children }: { title: string; onPress?: () => void; children: ReactNode }) {
  const press = usePressDim();
  const body = (
    <View className="min-h-[44px] flex-row items-center gap-3">
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="caption" className="font-medium uppercase tracking-wide text-muted-foreground">
          SHOWING
        </Text>
        <Text variant="headline" numberOfLines={2}>
          {title}
        </Text>
        {children}
      </View>
      {onPress ? (
        <View className="shrink-0 flex-row items-center gap-1 rounded-full bg-info-soft px-3 py-2">
          <Text variant="subhead" className="font-semibold text-info">
            Change
          </Text>
          <ChevronsUpDown size={16} className="text-info" />
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Choose another season"
      accessibilityValue={{ text: title }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>{body}</Animated.View>
    </Pressable>
  );
}

function SeasonRows({
  seasons,
  selected,
  onPick,
}: {
  seasons: ReportSeason[];
  selected: number | null;
  onPick: (id: number) => void;
}) {
  return (
    <>
      {seasons.map((s) => (
        <ListRow
          key={s.id}
          title={s.title}
          subtitle={seasonLine(s)}
          trailing={selected === s.id ? <Check size={18} className="text-info" /> : undefined}
          trailingLabel={selected === s.id ? "Showing" : undefined}
          onPress={() => onPick(s.id)}
        />
      ))}
    </>
  );
}

export function ReportSeasonHeader({
  seasons,
  selected,
  onSelect,
  allowAll,
  showResults = false,
}: {
  seasons: ReportSeason[];
  /** null: All seasons. */
  selected: number | null;
  onSelect: (id: number | null) => void;
  allowAll: boolean;
  /**
   * A finished season's Results: a super, or an admin, whose History lists only seasons they held
   * and who can't open those seasons' pages after End. Opened by id for that reason.
   */
  showResults?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const season = seasons.find((s) => s.id === selected);
  const current = seasons.filter(isCurrentSeason);
  const past = seasons.filter((s) => !isCurrentSeason(s)).sort((a, b) => b.endDate.localeCompare(a.endDate));
  const hasChoice = allowAll || seasons.length > 1;
  const pick = (id: number | null) => {
    setOpen(false);
    onSelect(id);
  };

  return (
    <>
      <View testID="report-season" className="flex-col gap-3 rounded-group bg-surface p-4">
        <SeasonPick title={season ? season.title : "All seasons"} onPress={hasChoice ? () => setOpen(true) : undefined}>
          {season ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <StatusChip {...statusChip("season", season.status)} />
              <Text variant="caption" className="text-muted-foreground">
                {seasonLine(season)}
              </Text>
            </View>
          ) : (
            <Text variant="caption" className="text-muted-foreground">
              {`Every season together (${seasons.length})`}
            </Text>
          )}
        </SeasonPick>
        {showResults && season && isSeasonFinished(season.status) ? (
          <View className="flex-row border-t border-separator pt-3">
            <PillButton
              label="Results"
              accessibilityLabel={`Results for ${season.title}`}
              onPress={() =>
                router.push({
                  pathname: "/seasons/[code]/results",
                  params: { code: season.code, id: String(season.id) },
                })
              }
            />
          </View>
        ) : null}
      </View>
      {/* Beside the card, not in it: the card stays put while a picked season loads. */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Seasons">
        <View className="flex-col gap-5">
          {allowAll ? (
            <GroupedList>
              <ListRow
                title="All seasons"
                subtitle="Every season together"
                trailing={selected === null ? <Check size={18} className="text-info" /> : undefined}
                trailingLabel={selected === null ? "Showing" : undefined}
                onPress={() => pick(null)}
              />
            </GroupedList>
          ) : null}
          {current.length > 0 ? (
            <GroupedList header="Current">
              <SeasonRows seasons={current} selected={selected} onPick={pick} />
            </GroupedList>
          ) : null}
          {past.length > 0 ? (
            <GroupedList header="Past seasons">
              <SeasonRows seasons={past} selected={selected} onPick={pick} />
            </GroupedList>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
