import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { SeasonsList } from "../../../src/design/seasons/seasons-list";
import { Button, EmptyState } from "../../../src/design/ui";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { useSessionStore } from "../../../src/store/session";

/**
 * SUPER's seasons list (v1 /super/seasons, B5-2): title, "New season" and the
 * program-grouped list with a pencil per row. ADMIN and MENTOR may reach this
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
      <Button
        size="sm"
        variant={value === null ? "default" : "outline"}
        onPress={() => onChange(null)}
      >
        All programs
      </Button>
      {programs.map((p) => (
        <Button
          key={p}
          size="sm"
          variant={value === p ? "default" : "outline"}
          onPress={() => onChange(p)}
        >
          {p}
        </Button>
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
      <ShellFrame>
        <EmptyState
          title="Not available"
          description="The seasons list isn't available for your role."
        />
      </ShellFrame>
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
    <ShellFrame refreshing={seasons.isRefetching} onRefresh={() => void seasons.refetch()}>
      <View className="flex-col gap-4">
        <View className="flex-row items-start justify-between gap-4">
          <PageTitle
            className="min-w-0 flex-1"
            title="Seasons"
            subtitle="Create and manage program seasons."
          />
          {isSuper ? <Button onPress={newSeason}>New season</Button> : null}
        </View>
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
              onEdit={
                isSuper
                  ? (row) =>
                      router.push({ pathname: "/seasons/[code]/edit", params: { code: row.code } })
                  : undefined
              }
              emptyAction={isSuper ? <Button onPress={newSeason}>New season</Button> : undefined}
            />
          </>
        )}
      </View>
    </ShellFrame>
  );
}
