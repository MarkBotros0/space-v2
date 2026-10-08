import type { ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { SeasonDetail } from "@space/shared";

import { EditSeason } from "../../../../src/components/season/EditSeason";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { formatDayKey, formatWallTime } from "../../../../src/lib/format";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/**
 * Season dates are timezone-naive calendar days stored as UTC midnight (spec
 * 02 D12); the ISO date part IS the day. Formatting the instant in the
 * device zone would show Dec 31 west of UTC.
 */
const seasonDay = (iso: string) => formatDayKey(iso.slice(0, 10));

function Actions({ season, isSuper }: { season: SeasonDetail; isSuper: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  if (!isSuper && !season.canAdminister) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
      {isSuper ? (
        <Button
          title="Edit season"
          variant="secondary"
          onPress={() => router.push({ pathname: "/seasons/[code]/edit", params: { code: season.code } })}
        />
      ) : null}
      {season.canAdminister ? (
        <>
          <Button
            title="Roster"
            variant="secondary"
            onPress={() => router.push({ pathname: "/seasons/[code]/roster", params: { code: season.code } })}
          />
          <Button
            title="New group"
            variant="secondary"
            onPress={() => router.push({ pathname: "/group/new", params: { seasonId: String(season.id) } })}
          />
          <Button
            title="New session"
            variant="secondary"
            onPress={() => router.push({ pathname: "/session/new", params: { seasonId: String(season.id) } })}
          />
        </>
      ) : null}
    </View>
  );
}

function SessionsCard({ seasonId }: { seasonId: number }) {
  const theme = useTheme();
  const router = useRouter();
  const sessions = useSeasonSessions(seasonId);
  let body: ReactNode;
  if (sessions.isPending) body = <LoadingState />;
  else if (sessions.isError) body = <ErrorState message="Couldn't load sessions." onRetry={() => void sessions.refetch()} />;
  else if (sessions.data.length === 0) body = <Text variant="body" color={theme.colors.neutral[600]}>No sessions yet.</Text>;
  else
    body = sessions.data.map((s) => (
      <Card
        key={s.id}
        style={{ marginTop: theme.spacing.sm }}
        onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
      >
        <Text variant="body">{s.title}</Text>
        {/* Server-derived org day and time (X13) — never the device's reading of startsAt. */}
        <Text variant="label" color={theme.colors.neutral[600]}>{`${formatDayKey(s.dayKey)} · ${formatWallTime(s.startTime)}`}</Text>
      </Card>
    ));
  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Sessions</Text>
      {body}
    </Card>
  );
}

/**
 * /seasons/[code] — any season, any role that may see it (spec 02 §9; G4).
 * One screen, role branches by data: SUPER gets Edit; whoever the server
 * says administers the season (canAdminister, C4) gets the workspace; others
 * read. Groups come pre-narrowed by the server for students.
 */
export default function SeasonDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const isAdmin = useSessionStore((s) => s.user?.role === "ADMIN");
  const detail = useSeasonByCode(code);

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" message="That season link isn't valid." />;
  else if (detail.isPending) body = <LoadingState />;
  else if (detail.isError)
    body = <ErrorState message="Couldn't load this season." onRetry={() => void detail.refetch()} />;
  else {
    const s = detail.data;
    body = (
      <>
        <Card>
          <Text variant="title">{s.title}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>{`${s.code} · ${s.status}`}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>{`${seasonDay(s.startDate)} – ${seasonDay(s.endDate)}`}</Text>
          {s.description ? <Text variant="body">{s.description}</Text> : null}
          <Text variant="label">{`${s.sessionCount} sessions · ${s.studentCount} students`}</Text>
        </Card>
        <Actions season={s} isSuper={isSuper} />
        <Card style={{ marginTop: theme.spacing.md }}>
          <Text variant="heading">Groups</Text>
          {s.groups.length === 0 ? (
            <Text variant="body" color={theme.colors.neutral[600]}>No groups yet.</Text>
          ) : (
            s.groups.map((g) => (
              <Card
                key={g.id}
                style={{ marginTop: theme.spacing.sm }}
                onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(g.id) } })}
              >
                <Text variant="body">{g.name}</Text>
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {g.leaderNames.length > 0 ? `${g.studentCount} students · ${g.leaderNames.join(", ")}` : `${g.studentCount} students`}
                </Text>
              </Card>
            ))
          )}
        </Card>
        <SessionsCard seasonId={s.id} />
        {isAdmin && s.canAdminister ? <EditSeason season={s} /> : null}
      </>
    );
  }

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={() => {
        if (code !== null) void detail.refetch();
      }}
      refreshing={detail.isRefetching}
    >
      {body}
    </Screen>
  );
}
