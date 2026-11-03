import { useRouter } from "expo-router";
import { View } from "react-native";

import { Eyebrow } from "../../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { shadowStyle } from "../../design/lib/shadow";
import { StatCard } from "../../design/students/stat-card";
import { Button as ButtonV1, Text as TextV1 } from "../../design/ui";
import { useMyEngagement } from "../../hooks/use-engagement";
import { useMyAttendance, useMyProfile } from "../../hooks/use-self-service";
import { useSessionStore } from "../../store/session";
import { IdentityCard } from "./identity-card";
import { ProfileForm } from "./profile-form";

/** v1 /student/profile — the six own columns editable, nothing else (Decision 1). */
export function StudentProfile() {
  const router = useRouter();
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const profile = useMyProfile(true);
  const attendance = useMyAttendance(activeSeasonId);
  const engagement = useMyEngagement(userId, activeSeasonId !== null);

  if (profile.isPending || profile.isError) {
    return (
      <ShellFrame>
        {profile.isPending ? (
          <RouteSkeleton />
        ) : (
          <RouteError onRetry={() => void profile.refetch()} />
        )}
      </ShellFrame>
    );
  }

  const p = profile.data;
  const budget = attendance.data?.budget ?? null;
  const streak = attendance.data?.streak ?? null;
  const eng = engagement.data;

  return (
    <ShellFrame
      onRefresh={() => {
        void profile.refetch();
        if (activeSeasonId !== null) {
          void attendance.refetch();
          void engagement.refetch();
        }
      }}
      refreshing={profile.isRefetching}
    >
      <View className="flex-col gap-3">
        <IdentityCard name={p.name} email={p.email} badge="Student" />
        {activeSeasonId !== null ? (
          <View className="flex-row gap-3">
            {/* v1 labelled this "Attendance" (spec 09 R68); it is the budget LEFT (spec 19 D14). */}
            <StatCard
              label="Absence budget left"
              value={budget ? `${budget.remainingPct}%` : "—"}
            />
            <StatCard
              label="Assignments"
              value={eng ? `${eng.submissionsCompleted}/${eng.submissionsExpected}` : "—"}
            />
            <StatCard
              label="Streak"
              value={streak === null ? "—" : String(streak)}
              icon={streak !== null && streak > 0 ? "flame" : undefined}
            />
          </View>
        ) : null}
        <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
          <Eyebrow className="mb-4">Your details</Eyebrow>
          <ProfileForm profile={p} />
        </View>
        {/* Decision 1: name and email are not edited here (PATCH /me owns User.name). */}
        <View
          className="flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4"
          style={shadowStyle("soft")}
        >
          <TextV1 className="text-sm text-muted-foreground">
            Change your name in Settings. To change your email, contact the JPC team.
          </TextV1>
          <ButtonV1 variant="outline" size="sm" onPress={() => router.push("/settings")}>
            Open settings
          </ButtonV1>
        </View>
      </View>
    </ShellFrame>
  );
}
