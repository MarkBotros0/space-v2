import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { SeasonsList } from "../../../../src/design/seasons/seasons-list";
import { Button, ChoiceChip, EmptyState } from "../../../../src/design/ui";
import { useSeasons } from "../../../../src/hooks/use-seasons";
import { useSessionStore } from "../../../../src/store/session";

/**
 * SUPER's seasons list (v1 /super/seasons, B5-2): title, "New season" and the
 * program-grouped list (editing is on the season detail). ADMIN and MENTOR may reach this
 * route and see the same list read-only. V2-ONLY kept: the program filter
 * chips (G20; spec 02 §9 — "filters, not routes"), exact string match (v1
 * R44) over the role-scoped list already loaded (Plan 6 D-16.5), standing in
 * for v1's /super/seasons/program/[program] and /year/[year] pages (B5-3).
 */
const STAFF_ROLES = new Set(["SUPER", "ADMIN", "MENTOR"]);

function ProgramFilter({
  programs,
  value,
  onChange,
}: {
  programs: string[];
  value: string | null;
  onChange: (program: string | null) => void;
}) {
  if (programs.length < 2) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      <ChoiceChip label="All programs" selected={value === null} onPress={() => onChange(null)} />
      {programs.map((p) => (
        <ChoiceChip key={p} label={p} selected={value === p} onPress={() => onChange(p)} />
      ))}
    </View>
  );
}

export default function SeasonsScreen() {
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStaff = role !== null && STAFF_ROLES.has(role);
  const isSuper = role === "SUPER";
  const seasons = useSeasons(isStaff);
  const [program, setProgram] = useState<string | null>(null);

  if (!isStaff) {
    return (
      <Screen title="Seasons">
        <EmptyState
          title="Not available"
          description="The seasons list isn't available for your role."
        />
      </Screen>
    );
  }

  const newSeason = () => router.push("/seasons/new");
  const programs = seasons.data
    ? Array.from(new Set(seasons.data.map((s) => s.program))).sort((a, b) => a.localeCompare(b))
    : [];
  const visible = seasons.data
    ? seasons.data.filter((s) => program === null || s.program === program)
    : [];

  return (
    <Screen
      title="Seasons"
      trailing={
        isSuper ? (
          <Button size="sm" onPress={newSeason}>
            New season
          </Button>
        ) : undefined
      }
      refreshing={seasons.isRefetching}
      onRefresh={() => void seasons.refetch()}
    >
      <View className="flex-col gap-4">
        {seasons.isPending ? (
          <RouteSkeleton />
        ) : seasons.isError ? (
          <RouteError onRetry={() => void seasons.refetch()} />
        ) : (
          <>
            <ProgramFilter programs={programs} value={program} onChange={setProgram} />
            <SeasonsList
              rows={visible}
              onOpen={(row) =>
                router.push({ pathname: "/seasons/[code]", params: { code: row.code } })
              }
              emptyAction={isSuper ? <Button onPress={newSeason}>New season</Button> : undefined}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
