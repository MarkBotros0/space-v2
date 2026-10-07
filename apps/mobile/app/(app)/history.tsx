import { useState } from "react";
import { Pressable, View } from "react-native";
import type { SeasonHistoryRow } from "@space/shared";

import { useSeasonHistory } from "../../src/hooks/use-self-service";
import { formatDate, formatDayKey } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

const EDGES = ["top", "left", "right"] as const;

/**
 * /history — STUDENT (sidebar) and ALUMNI (tab). One screen for v1's two
 * pages (spec 02 §9): the only difference was whether the current season is
 * excluded, and the server decides that from the token (Plan 11 Decision 3).
 * Privacy-critical (R34): the contract carries attendance % and curriculum
 * only, and its schema is strict, so nothing else can reach this screen.
 */
function SeasonHistoryCard({ row }: { row: SeasonHistoryRow }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const count = row.curriculum.length;

  return (
    <Card style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
      <Text variant="heading">{row.title}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {`${formatDate(row.startDate)} – ${formatDate(row.endDate)}${row.groupName ? ` · ${row.groupName}` : ""}`}
      </Text>
      {/* R40: v1 badges every row "Participated"; the enrollment status is not read. */}
      <Text variant="label">{`${row.attendancePct}% attended · Participated`}</Text>
      {count > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((o) => !o)}
          >
            <Text variant="label" color={theme.colors.brand.navy[900]}>
              {`Curriculum (${count} ${count === 1 ? "session" : "sessions"})`}
            </Text>
          </Pressable>
          {open
            ? row.curriculum.map((s) => (
                <View
                  key={s.sessionId}
                  style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm }}
                >
                  <Text variant="body" style={{ flex: 1 }}>
                    {s.title}
                  </Text>
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    {formatDayKey(s.dayKey)}
                  </Text>
                </View>
              ))
            : null}
        </>
      ) : null}
    </Card>
  );
}

export default function HistoryScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const isStudent = role === "STUDENT";
  const isAlumnus = isStudent && graduationYear !== null;
  const { data, isPending, isError, refetch, isRefetching } = useSeasonHistory(activeSeasonId, isStudent);

  if (!isStudent) {
    return (
      <Screen edges={EDGES}>
        <EmptyState title="History" message="Season history is for students and alumni." />
      </Screen>
    );
  }

  return (
    <Screen edges={EDGES} scroll onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Text variant="title">{isAlumnus ? "My History" : "History"}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {isAlumnus ? "The seasons you journeyed through" : "Seasons you've participated in"}
      </Text>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load your history." onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          title="No past seasons"
          message={
            isAlumnus ? "Your completed seasons will appear here." : "Once you complete a season, it'll appear here."
          }
        />
      ) : (
        data.map((row) => <SeasonHistoryCard key={row.seasonId} row={row} />)
      )}
    </Screen>
  );
}
