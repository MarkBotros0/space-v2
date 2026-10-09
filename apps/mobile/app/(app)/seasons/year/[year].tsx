import type { ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";

import { SeasonProgramSections } from "../../../../src/components/season/SeasonList";
import { useSeasons } from "../../../../src/hooks/use-seasons";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/** v1 year page:23-24 — `Number.isInteger(Number(year))`; any integer is accepted. */
export function parseSeasonYear(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * SUPER's by-year seasons (v1 /super/seasons/year/[year]; spec 02 R45, R46,
 * R47 — v1 parity 2026-10-09). A non-integer year or a year with no seasons
 * is not found (v1 page:24,41). Seasons are ordered `program` asc and
 * regrouped under program headings the way the list is (v1 page:27).
 */
export default function SeasonsByYearScreen() {
  const theme = useTheme();
  const { year: raw } = useLocalSearchParams<{ year: string }>();
  const year = parseSeasonYear(raw);
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const seasons = useSeasons(isSuper && year !== null);

  let body: ReactNode;
  if (!isSuper) body = <EmptyState title="Not available" message="Only a super admin can browse seasons by year." />;
  else if (year === null) body = <EmptyState title="Not found" message="That year isn't valid." />;
  else if (seasons.isPending) body = <LoadingState />;
  else if (seasons.isError) body = <ErrorState message="Couldn't load seasons." onRetry={() => void seasons.refetch()} />;
  else {
    const rows = seasons.data.filter((s) => s.year === year).sort((a, b) => a.program.localeCompare(b.program));
    body =
      rows.length === 0 ? (
        <EmptyState title="Not found" message="No seasons in that year." />
      ) : (
        <>
          <Text variant="title">{String(year)}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`${rows.length} season${rows.length === 1 ? "" : "s"} across all programs in ${year}`}
          </Text>
          <SeasonProgramSections seasons={rows} canWrite linkHeadings />
        </>
      );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={() => void seasons.refetch()} refreshing={seasons.isRefetching}>
      {body}
    </Screen>
  );
}
