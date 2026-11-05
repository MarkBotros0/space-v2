import { View } from "react-native";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { StatusChip } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { useMyProfile } from "../../hooks/use-self-service";

/** A value over its label, like the other rows, but holding a chip: at font 1.3 a long chip would crush a trailing slot. */
function StatusRow({ label, chip }: { label: string; chip: string }) {
  return (
    <View className="min-h-[52px] flex-col items-start gap-1 px-4 py-2">
      <Text variant="caption" className="text-muted-foreground">
        {label}
      </Text>
      <StatusChip tone="ok" label={chip} />
    </View>
  );
}

/** v1 /alumni/profile — read-only (app/alumni/profile/page.tsx:31-46). */
export function AlumniProfile() {
  const profile = useMyProfile(true);

  if (profile.isPending || profile.isError) {
    return (
      <Screen title="Profile" subtitle="Your alumni record">
        {profile.isPending ? (
          <RouteSkeleton />
        ) : (
          <RouteError onRetry={() => void profile.refetch()} />
        )}
      </Screen>
    );
  }

  const p = profile.data;
  return (
    <Screen
      title="Profile"
      subtitle="Your alumni record"
      onRefresh={() => void profile.refetch()}
      refreshing={profile.isRefetching}
    >
      <View className="flex-col gap-4">
        <GroupedList>
          <ListRow title={p.name} subtitle="Name" titleLines={2} />
          <ListRow title={p.email} subtitle="Email" titleLines={2} />
          <ListRow title={p.university || "—"} subtitle="University" titleLines={2} />
          {p.graduationYear !== null ? (
            <StatusRow label="Status" chip={`Alumnus · Class of ${p.graduationYear}`} />
          ) : (
            <ListRow title="—" subtitle="Status" />
          )}
        </GroupedList>
        <Text variant="caption" className="text-muted-foreground">
          To update your details, please contact the JPC team.
        </Text>
      </View>
    </Screen>
  );
}
