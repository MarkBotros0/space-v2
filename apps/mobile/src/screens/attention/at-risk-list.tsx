import { useRouter } from "expo-router";
import { View } from "react-native";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, GroupedList, ListRow } from "../../design/ui";
import { useEngagementStudents } from "../../hooks/use-reports";
import { joinMeta } from "../../lib/join-meta";
import { atRiskReason } from "../home/at-risk-reason";
import { LoadMoreButton } from "../../design/ui/load-more-button";

/**
 * The list behind Today's "N students at risk": the AT_RISK band of the same
 * engagement read (same key, same season param) the count came from.
 */
export function StudentsAtRisk({ seasonId }: { seasonId: number | undefined }) {
  const router = useRouter();
  const q = useEngagementStudents(seasonId ?? null, "AT_RISK", true);
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const refetch = () => void q.refetch();

  let body;
  if (q.isPending) body = <RouteSkeleton />;
  else if (q.isError) body = <RouteError onRetry={refetch} />;
  else if (rows.length === 0)
    body = (
      <EmptyState
        icon={NAV_ICONS.students}
        title="No students at risk"
        description="Everyone is keeping up with attendance and assignments."
      />
    );
  else
    body = (
      <View className="flex-col gap-4">
        <GroupedList>
          {rows.map((r) => (
            <ListRow
              key={`${r.studentUserId}:${r.seasonId}`}
              title={r.name}
              subtitle={joinMeta([seasonId === undefined && r.seasonTitle, atRiskReason(r)])}
              chevron
              onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(r.studentUserId) } })}
            />
          ))}
        </GroupedList>
        <LoadMoreButton query={q} />
      </View>
    );

  return (
    <Screen title="Students at risk" refreshing={q.isRefetching} onRefresh={refetch}>
      {body}
    </Screen>
  );
}
