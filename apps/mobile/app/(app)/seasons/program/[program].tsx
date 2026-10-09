import type { ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";

import { SeasonRow } from "../../../../src/components/season/SeasonList";
import { useSeasons } from "../../../../src/hooks/use-seasons";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/**
 * SUPER's by-program seasons (v1 /super/seasons/program/[program]; spec 02
 * R44, R45, R47 — v1 parity 2026-10-09). Exact-string program match ("GBV" is
 * not "gbv"), deleted seasons excluded (the list never holds them), `year`
 * desc (v1 page:27); no seasons → not found (v1 page:40). Reads the
 * role-scoped list already loaded, client-side (Plan 6 D-16.5).
 */
export default function SeasonsByProgramScreen() {
  const theme = useTheme();
  const { program: raw } = useLocalSearchParams<{ program: string }>();
  const program = typeof raw === "string" ? raw : null;
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const seasons = useSeasons(isSuper);

  let body: ReactNode;
  if (!isSuper) body = <EmptyState title="Not available" message="Only a super admin can browse seasons by program." />;
  else if (seasons.isPending) body = <LoadingState />;
  else if (seasons.isError) body = <ErrorState message="Couldn't load seasons." onRetry={() => void seasons.refetch()} />;
  else {
    const rows = seasons.data.filter((s) => s.program === program).sort((a, b) => b.year - a.year);
    body =
      program === null || rows.length === 0 ? (
        <EmptyState title="Not found" message="No seasons match that program." />
      ) : (
        <>
          <Text variant="title">{program}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`${rows.length} season${rows.length === 1 ? "" : "s"}`}
          </Text>
          {rows.map((s) => (
            <SeasonRow key={s.id} season={s} canWrite />
          ))}
        </>
      );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={() => void seasons.refetch()} refreshing={seasons.isRefetching}>
      {body}
    </Screen>
  );
}
