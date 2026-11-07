import { useRouter } from "expo-router";
import { View } from "react-native";
import type { MeUser, MyProfile } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { PillButton } from "../../design/ui";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { useMyProfile } from "../../hooks/use-self-service";
import { formatDayKey } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { IdentityCard } from "./identity-card";
import { useProfileKind } from "./profile-kind";

const NOT_ADDED = "Not added";

/** A value over its label, read-only. */
function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim() ? value : NOT_ADDED;
  return <ListRow title={text} subtitle={label} titleLines={3} />;
}

/**
 * Profile (owner, 2026-11-07): one page for who you are, read-only, with Edit
 * opening `/edit-profile`. It merges what were Profile and Profile settings, and
 * shows no season figures (they belong on Home and Attendance). Opened from More's
 * name row and Home's avatar; alumni also have it as a tab.
 */
export function ProfileView() {
  const user = useSessionStore((s) => s.user);
  const kind = useProfileKind();
  const profile = useMyProfile(kind !== "staff");

  if (!user) return null; // the (app) layout redirects before this renders
  if (kind !== "staff" && (profile.isPending || profile.isError)) {
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
    <Screen
      title="Profile"
      onRefresh={kind === "staff" ? undefined : () => void profile.refetch()}
      refreshing={profile.isRefetching}
    >
      <ProfileBody user={user} profile={profile.data ?? null} />
    </Screen>
  );
}

function ProfileBody({ user, profile }: { user: MeUser; profile: MyProfile | null }) {
  const router = useRouter();
  const year = profile?.universityGraduationYear;

  return (
    <View className="flex-col gap-6">
      <IdentityCard
        name={user.name}
        email={user.email}
        action={
          <PillButton
            label="Edit"
            accessibilityLabel="Edit profile"
            onPress={() => router.push("/edit-profile")}
          />
        }
      />
      <GroupedList header="Your details">
        <Detail label="Phone" value={user.phone} />
        <Detail
          label="Date of birth"
          value={user.dateOfBirth ? formatDayKey(user.dateOfBirth) : null}
        />
        <Detail label="Address" value={user.address} />
      </GroupedList>
      {profile ? (
        <GroupedList header="Academic">
          <Detail label="University" value={profile.university} />
          <Detail label="Faculty" value={profile.faculty} />
          <Detail label="Graduation year" value={year == null ? null : String(year)} />
          {profile.graduationYear !== null ? (
            <Detail label="JPC" value={`School of ${profile.graduationYear}`} />
          ) : null}
        </GroupedList>
      ) : null}
    </View>
  );
}
