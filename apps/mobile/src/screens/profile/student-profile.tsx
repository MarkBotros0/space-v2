import { useRouter } from "expo-router";
import { View } from "react-native";

import { FormScreen } from "../../design/layout/form-screen";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { GroupedList, ListRow, ListSectionHeader } from "../../design/ui/grouped-list";
import { StatTile } from "../../design/ui/stat-tile";
import { useMyEngagement } from "../../hooks/use-engagement";
import { useMyAttendance, useMyProfile } from "../../hooks/use-self-service";
import { useSessionStore } from "../../store/session";
import { IdentityCard } from "./identity-card";
import { useProfileForm } from "./profile-form";

/** v1 /student/profile — the six own columns editable, nothing else (Decision 1). */
export function StudentProfile() {
  const profile = useMyProfile(true);

  if (profile.isPending || profile.isError) {
    return (
      <Screen title="Profile">
        {profile.isPending ? (
          <RouteSkeleton />
        ) : (
          <RouteError onRetry={() => void profile.refetch()} />
        )}
      </Screen>
    );
  }
  return (
    <LoadedProfile
      profile={profile.data}
      refetch={() => void profile.refetch()}
      refreshing={profile.isRefetching}
    />
  );
}

function LoadedProfile({
  profile: p,
  refetch,
  refreshing,
}: {
  profile: NonNullable<ReturnType<typeof useMyProfile>["data"]>;
  refetch: () => void;
  refreshing: boolean;
}) {
  const router = useRouter();
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const attendance = useMyAttendance(activeSeasonId);
  const engagement = useMyEngagement(userId, activeSeasonId !== null);
  const form = useProfileForm(p);

  const budget = attendance.data?.budget ?? null;
  const streak = attendance.data?.streak ?? null;
  const eng = engagement.data;

  return (
    <FormScreen
      title="Profile"
      saveLabel="Save changes"
      onSave={form.save}
      saving={form.saving}
      saveDisabled={!form.dirty}
      onRefresh={() => {
        refetch();
        if (activeSeasonId !== null) {
          void attendance.refetch();
          void engagement.refetch();
        }
      }}
      refreshing={refreshing}
    >
      <View className="flex-col gap-6">
        <IdentityCard name={p.name} email={p.email} badge="Student" />
        {activeSeasonId !== null ? (
          <View className="gap-3">
            <View testID="profile-figures-pair" className="flex-row flex-wrap gap-3">
              {/* v1 labelled this "Attendance" (spec 09 R68); it is the budget LEFT (spec 19 D14). */}
              <StatTile
                label="Absence budget left"
                value={budget ? budget.remainingPct : "—"}
                suffix={budget ? "%" : undefined}
              />
              <StatTile
                label="Assignments"
                value={eng ? `${eng.submissionsCompleted}/${eng.submissionsExpected}` : "—"}
              />
            </View>
            {/* Streak is one column wide: the spacer holds the other half so it never stretches. */}
            <View testID="profile-figures-last" className="flex-row gap-3">
              <StatTile label="Streak" value={streak === null ? "—" : streak} />
              <View testID="profile-figures-spacer" className="min-w-[136px] flex-1" />
            </View>
          </View>
        ) : null}
        <View>
          <ListSectionHeader>Your details</ListSectionHeader>
          <View className="rounded-group bg-surface p-4">{form.fields}</View>
        </View>
        {/* Name, phone, date of birth and address are edited in Settings → Profile details (PATCH /me). */}
        <GroupedList>
          <ListRow
            title="Profile details"
            subtitle="Name, phone, date of birth and address. To change your email, contact the JPC team."
            subtitleLines={3}
            chevron
            onPress={() => router.push("/settings/profile")}
          />
        </GroupedList>
      </View>
    </FormScreen>
  );
}
