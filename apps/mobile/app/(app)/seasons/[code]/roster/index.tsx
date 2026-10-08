import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { GroupListItem, SeasonRosterRow } from "@space/shared";

import { useSaveGroupAssignments, useSeasonRoster } from "../../../../../src/hooks/use-group-admin";
import { useSeasonGroups } from "../../../../../src/hooks/use-groups";
import { useSeasonByCode } from "../../../../../src/hooks/use-seasons";
import { apiErrorMessage } from "../../../../../src/lib/api-error";
import { useTheme } from "../../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../../src/ui";

export const ROSTER_UNASSIGNED_LABEL = "Unassigned";

function GroupChip({ label, selected, onPress, a11yLabel }: { label: string; selected: boolean; onPress: () => void; a11yLabel: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={{
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radii.sm,
        borderWidth: theme.borderWidths.thin,
        borderColor: selected ? theme.colors.brand.navy[900] : theme.colors.neutral[300],
      }}
    >
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}

/**
 * The bulk-assign grid (v1 roster-grid.tsx; spec 05 §9; G7). Sends only the
 * rows whose choice differs from the server's (v1 R100) and reports the
 * server's WRITTEN counts, not the number sent (R101/D-16.12). Rows are ACTIVE
 * enrolments (C9); a student sitting in another season's group says so (R82).
 */
function RosterGrid({ seasonId }: { seasonId: number }) {
  const theme = useTheme();
  const roster = useSeasonRoster(seasonId);
  const groups = useSeasonGroups(seasonId);
  const save = useSaveGroupAssignments(seasonId);
  const [draft, setDraft] = useState<Record<number, number | null>>({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (roster.isPending || groups.isPending) return <LoadingState />;
  if (roster.isError) return <ErrorState message="Couldn't load the roster." onRetry={() => void roster.refetch()} />;
  if (groups.isError) return <ErrorState message="Couldn't load the groups." onRetry={() => void groups.refetch()} />;
  if (roster.data.length === 0) {
    return <EmptyState title="No active students" message="Nobody is actively enrolled in this season yet." />;
  }
  if (groups.data.length === 0) {
    return <EmptyState title="No groups" message="Create a group first, then assign students to it." />;
  }

  const choice = (r: SeasonRosterRow) => (r.userId in draft ? (draft[r.userId] ?? null) : r.groupId);
  const pick = (r: SeasonRosterRow, groupId: number | null) => {
    setMessage(null);
    setDraft((d) => {
      const next = { ...d };
      if (groupId === r.groupId) delete next[r.userId];
      else next[r.userId] = groupId;
      return next;
    });
  };
  // Roster order, so the batch is deterministic.
  const changes = roster.data
    .filter((r) => r.userId in draft)
    .map((r) => ({ studentUserId: r.userId, groupId: draft[r.userId] ?? null }));

  const onSave = () => {
    save.mutate(
      { assignments: changes },
      {
        onSuccess: (result) => {
          setDraft({});
          const skipped = result.skippedStudentIds.length;
          setMessage(
            `Assigned ${result.assigned}, unassigned ${result.unassigned}.` +
              (skipped > 0 ? ` ${skipped} skipped — no longer active in this season.` : ""),
          );
        },
        onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the roster.")),
      },
    );
  };

  const q = query.trim().toLowerCase();
  const rows = roster.data.filter(
    (r) => q === "" || (r.name ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
  );
  const options: (GroupListItem | null)[] = [null, ...groups.data];

  return (
    <>
      <Input label="Search students" value={query} onChangeText={setQuery} autoCapitalize="none" />
      {rows.map((r) => {
        const label = r.name ?? r.email;
        const current = choice(r);
        return (
          <Card key={r.userId} style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
            <Text variant="body">{label}</Text>
            {r.otherSeasonGroup ? (
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {`Also in ${r.otherSeasonGroup.groupName} (${r.otherSeasonGroup.seasonCode}) — that stays as it is.`}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
              {options.map((g) => {
                const name = g?.name ?? ROSTER_UNASSIGNED_LABEL;
                return (
                  <GroupChip
                    key={g?.id ?? "none"}
                    label={name}
                    a11yLabel={`${label}: ${name}`}
                    selected={current === (g?.id ?? null)}
                    onPress={() => pick(r, g?.id ?? null)}
                  />
                );
              })}
            </View>
          </Card>
        );
      })}
      {message ? <Text variant="label" style={{ marginTop: theme.spacing.md }}>{message}</Text> : null}
      <Button
        title={`Save ${changes.length} change${changes.length === 1 ? "" : "s"}`}
        onPress={onSave}
        disabled={changes.length === 0}
        loading={save.isPending}
        style={{ marginTop: theme.spacing.md }}
      />
    </>
  );
}

/** /seasons/[code]/roster — `roster/import.tsx` (Plan 17) hangs off the "Import groups" action. */
export default function SeasonRosterScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const season = useSeasonByCode(code);

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" message="That season link isn't valid." />;
  else if (season.isPending) body = <LoadingState />;
  else if (season.isError) body = <ErrorState message="Couldn't load this season." onRetry={() => void season.refetch()} />;
  else if (!season.data.canAdminister)
    body = <EmptyState title="Not available" message="Only this season's admins can manage its roster." />;
  else body = <RosterGrid seasonId={season.data.id} />;

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {/* Spec 16 §9 / v1 roster/page.tsx:42: same predicate as the grid — the
          server's own canAdminister, not a client re-derivation. */}
      {code !== null && season.data?.canAdminister ? (
        <Button
          title="Import groups"
          variant="secondary"
          onPress={() => router.push({ pathname: "/seasons/[code]/roster/import", params: { code } })}
        />
      ) : null}
      {body}
    </Screen>
  );
}
