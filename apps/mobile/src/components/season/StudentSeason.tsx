import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { MySeason } from "@space/shared";

import { useMySeason } from "../../hooks/use-self-service";
import { formatDate, formatDayKey, formatSessionTime } from "../../lib/format";
import { initialsOf } from "../../lib/initials";
import { useSessionStore } from "../../store/session";
import { useTheme } from "../../theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../ui";

const EDGES = ["top", "left", "right"] as const;

function GroupCard({ group }: { group: NonNullable<MySeason["group"]> }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Your group
      </Text>
      <Text variant="heading">{group.name}</Text>
      {group.description ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          {group.description}
        </Text>
      ) : null}
      <Text variant="label">{group.leaders.length === 1 ? "Leader" : "Leaders"}</Text>
      {group.leaders.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          No leaders assigned yet.
        </Text>
      ) : (
        group.leaders.map((leader) => (
          <View key={leader.id} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: theme.radii.full,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.colors.neutral[100],
              }}
            >
              <Text variant="label">{initialsOf(leader.name, leader.email.charAt(0).toUpperCase() || "?")}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body">{leader.name}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {leader.email}
              </Text>
            </View>
          </View>
        ))
      )}
      <Text variant="label">{`Members (${group.members.length})`}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
        {group.members.map((member) => (
          <View
            key={member.id}
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              borderRadius: theme.radii.full,
              backgroundColor: member.isYou ? theme.colors.brand.teal[100] : theme.colors.neutral[100],
            }}
          >
            <Text variant="caption">{member.isYou ? "You" : member.name}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function UpcomingCard({ upcoming }: { upcoming: MySeason["upcoming"] }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="heading">Upcoming sessions</Text>
        <Button title="See calendar" variant="ghost" onPress={() => router.push("/calendar")} />
      </View>
      {upcoming.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          No upcoming sessions.
        </Text>
      ) : (
        upcoming.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
          >
            <Text variant="body">{s.title}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${formatDayKey(s.dayKey)} · ${formatSessionTime(s.startsAt)}${s.location ? ` · ${s.location}` : ""}`}
            </Text>
          </Pressable>
        ))
      )}
    </Card>
  );
}

/**
 * The student's `/season` (v1 app/student/season/page.tsx:40-281, G21). One
 * read, GET /me/season (Plan 11 Decision 5): progress and "upcoming" are
 * server-derived (C4) and the group comes from this season's enrollment (C9).
 */
export function StudentSeason() {
  const theme = useTheme();
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const { data, isPending, isError, refetch, isRefetching } = useMySeason(seasonId);

  const noSeason = <EmptyState title="No active season" message="An admin will enroll you when you're ready." />;
  let body: ReactNode;
  if (seasonId === null) body = noSeason;
  else if (isPending) body = <LoadingState />;
  else if (isError) body = <ErrorState message="Couldn't load your season." onRetry={() => void refetch()} />;
  else if (data === null) body = noSeason;
  else {
    const { completedSessions, totalSessions, pct } = data.progress;
    body = (
      <>
        <Card style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Current season
          </Text>
          <Text variant="title">{data.title}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`${formatDate(data.startDate)} – ${formatDate(data.endDate)}`}
          </Text>
          <Text variant="label">{data.group ? `${data.status} · ${data.group.name}` : data.status}</Text>
          {totalSessions > 0 ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="label">{`Session ${completedSessions} of ${totalSessions}`}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {pct >= 100 ? "Complete" : `${totalSessions - completedSessions} to go`}
              </Text>
            </View>
          ) : null}
        </Card>
        {data.group ? <GroupCard group={data.group} /> : null}
        {data.description ? (
          <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              About this season
            </Text>
            <Text variant="body">{data.description}</Text>
          </Card>
        ) : null}
        <UpcomingCard upcoming={data.upcoming} />
      </>
    );
  }

  return (
    <Screen
      edges={EDGES}
      scroll
      onRefresh={() => {
        if (seasonId !== null) void refetch();
      }}
      refreshing={isRefetching}
    >
      {body}
    </Screen>
  );
}
