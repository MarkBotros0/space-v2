import { useRouter } from "expo-router";
import { View } from "react-native";

import { GroupedList, ListRow } from "../../design/ui";
import { InlineError } from "../../design/layout/route-states";
import { hasNothingToDo, type NeedsAction } from "../../lib/staff-today";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * What needs doing, as rows. A row exists only for a count above zero; a count
 * that is unknown (null) is never shown as 0, it becomes one inline error with
 * a retry. "Nothing needs action" only when every applicable count is 0.
 * `scopeSeasonId` is the season the counts were taken in (ADMIN), so each row
 * opens the list that holds exactly those items.
 */
export function NeedsActionList({
  needs,
  scopeSeasonId,
  onRetry,
}: {
  needs: NeedsAction;
  scopeSeasonId: number | null;
  onRetry: () => void;
}) {
  const router = useRouter();
  const season = scopeSeasonId === null ? {} : { seasonId: String(scopeSeasonId) };
  const hasSeason = scopeSeasonId !== null;

  const rows: { key: string; title: string; open: () => void }[] = [];
  const unknown: string[] = [];

  const { pendingReview: review, unmarkedSessions: unmarked, atRisk, pendingInvites: invites } = needs;
  if (review === null) unknown.push("submissions waiting for review");
  else if (review > 0)
    rows.push({
      key: "review",
      title: `${review} ${plural(review, "submission", "submissions")} waiting for review`,
      open: () => router.push({ pathname: "/submissions", params: { pending: "1", ...season } }),
    });
  if (unmarked === null) unknown.push("sessions with no attendance");
  else if (unmarked > 0)
    rows.push({
      key: "sessions",
      title: `${unmarked} ${plural(unmarked, "session", "sessions")} with no attendance`,
      open: () =>
        hasSeason
          ? router.push({ pathname: "/attention/sessions", params: season })
          : router.push("/attention/sessions"),
    });
  if (atRisk === null) unknown.push("students at risk");
  else if (atRisk > 0)
    rows.push({
      key: "risk",
      title: `${atRisk} ${plural(atRisk, "student", "students")} at risk`,
      open: () =>
        hasSeason
          ? router.push({ pathname: "/attention/at-risk", params: season })
          : router.push("/attention/at-risk"),
    });
  if (invites === null) unknown.push("people not invited yet");
  else if (invites !== undefined && invites > 0)
    rows.push({
      key: "invites",
      title: `${invites} ${plural(invites, "person", "people")} not invited yet`,
      open: () => router.push({ pathname: "/users", params: { status: "pending" } }),
    });

  return (
    <GroupedList header="Needs action">
      {rows.map((r, i) => (
        <ListRow key={r.key} index={i} title={r.title} chevron onPress={r.open} />
      ))}
      {unknown.length > 0 ? (
        <View className="px-4 py-3">
          <InlineError message={`Couldn't load ${unknown.join(", ")}.`} onRetry={onRetry} />
        </View>
      ) : null}
      {unknown.length === 0 && hasNothingToDo(needs) ? <ListRow title="Nothing needs action" /> : null}
    </GroupedList>
  );
}
