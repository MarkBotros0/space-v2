import { useRouter } from "expo-router";
import { CalendarX, FileText, MailPlus, TriangleAlert } from "lucide-react-native";
import { View } from "react-native";

import { CountGrid, type CountTileProps } from "../../design/home/count-tile";
import { InlineError } from "../../design/layout/route-states";
import { ListSectionHeader } from "../../design/ui";
import type { NeedsAction } from "../../lib/staff-today";

/**
 * What needs doing, as coloured tiles (owner, 2026-11-07: Home should be clear
 * and vivid, not a stack of rows). Only counts above zero get a tile, and all
 * zero reads "All caught up" (`CountGrid`); a count that is unknown (null) is
 * never shown as 0, it becomes one inline error with a retry. Home passes
 * `atRiskTile={false}`: it lists the students at risk by name right below. `scopeSeasonId` is the season the
 * counts were taken in (ADMIN), so each tile opens the list that holds exactly
 * those items.
 */
export function NeedsActionList({
  needs,
  scopeSeasonId,
  onRetry,
  title = "Needs action",
  atRiskTile = true,
}: {
  /** False where the students at risk are listed by name right below (Home). */
  atRiskTile?: boolean;
  /** The section's heading: Home says "Needs action", a season's page "Needs attention". */
  title?: string;
  needs: NeedsAction;
  scopeSeasonId: number | null;
  onRetry: () => void;
}) {
  const router = useRouter();
  const season = scopeSeasonId === null ? {} : { seasonId: String(scopeSeasonId) };
  const hasSeason = scopeSeasonId !== null;

  const tiles: CountTileProps[] = [];
  const unknown: string[] = [];
  const {
    pendingReview: review,
    unmarkedSessions: unmarked,
    atRisk,
    pendingInvites: invites,
  } = needs;

  if (review === null) unknown.push("submissions waiting for review");
  else
    tiles.push({
      label: "Submissions to review",
      value: review,
      icon: FileText,
      tone: "info",
      onPress: () => router.push({ pathname: "/submissions", params: season }),
    });
  if (unmarked === null) unknown.push("sessions with no attendance");
  else
    tiles.push({
      label: "Sessions without attendance",
      value: unmarked,
      icon: CalendarX,
      tone: "warn",
      onPress: () =>
        hasSeason
          ? router.push({ pathname: "/attention/sessions", params: season })
          : router.push("/attention/sessions"),
    });
  if (!atRiskTile) {
    // Listed by name below, with its own See all.
  } else if (atRisk === null) unknown.push("students at risk");
  else
    tiles.push({
      label: "Students at risk",
      value: atRisk,
      icon: TriangleAlert,
      tone: "bad",
      onPress: () =>
        hasSeason
          ? router.push({ pathname: "/attention/at-risk", params: season })
          : router.push("/attention/at-risk"),
    });
  // ADMIN has no invites count at all (undefined): no tile.
  if (invites === null) unknown.push("people not invited yet");
  else if (invites !== undefined)
    tiles.push({
      label: "Not invited yet",
      value: invites,
      icon: MailPlus,
      tone: "info",
      onPress: () => router.push({ pathname: "/community", params: { status: "pending" } }),
    });

  return (
    <View className="gap-2">
      <ListSectionHeader className="pb-0">{title}</ListSectionHeader>
      {/* "All caught up" only when every count is known: a failed read is never read as zero. */}
      {tiles.some((t) => t.value > 0) || (tiles.length > 0 && unknown.length === 0) ? (
        <CountGrid tiles={tiles} />
      ) : null}
      {unknown.length > 0 ? (
        <InlineError message={`Couldn't load ${unknown.join(", ")}.`} onRetry={onRetry} />
      ) : null}
    </View>
  );
}
