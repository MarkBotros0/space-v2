import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Users } from "lucide-react-native";
import type { SeasonRosterRow } from "@space/shared";

import { PageTitle } from "../../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../../src/design/layout/shell-frame";
import { cn } from "../../../../../src/design/lib/cn";
import {
  Button,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  toast,
} from "../../../../../src/design/ui";
import { useSaveGroupAssignments, useSeasonRoster } from "../../../../../src/hooks/use-group-admin";
import { useSeasonGroups } from "../../../../../src/hooks/use-groups";
import { useSeasonByCode } from "../../../../../src/hooks/use-seasons";
import { apiErrorMessage } from "../../../../../src/lib/api-error";

export const ROSTER_UNASSIGNED_LABEL = "Unassigned";
const NONE = "none";

/**
 * The bulk-assign grid (v1 roster-grid.tsx; spec 05 §9; G7): a card per
 * student with a group Select, a dirty border, and "n unsaved changes" +
 * "Save changes" above. Sends only the rows whose choice differs from the
 * server's (v1 R100) and reports the server's WRITTEN counts, not the number
 * sent (R101/D-16.12). Rows are ACTIVE enrolments (C9); a student sitting in
 * another season's group says so (R82). V2-ONLY: the search box.
 */
function RosterGrid({ seasonId, onNewGroup }: { seasonId: number; onNewGroup: () => void }) {
  const roster = useSeasonRoster(seasonId);
  const groups = useSeasonGroups(seasonId);
  const save = useSaveGroupAssignments(seasonId);
  const [draft, setDraft] = useState<Record<number, number | null>>({});
  const [query, setQuery] = useState("");

  if (roster.isPending || groups.isPending) return <RouteSkeleton />;
  if (roster.isError) return <RouteError onRetry={() => void roster.refetch()} />;
  if (groups.isError) return <RouteError onRetry={() => void groups.refetch()} />;
  if (roster.data.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No students in this season"
        description="Students appear here once their active season is set for this season (e.g. via the profile import)."
      />
    );
  }
  if (groups.data.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No groups yet"
        description="Create at least one group before assigning students."
        action={<Button onPress={onNewGroup}>New group</Button>}
      />
    );
  }

  const choice = (r: SeasonRosterRow) =>
    r.userId in draft ? (draft[r.userId] ?? null) : r.groupId;
  const pick = (r: SeasonRosterRow, groupId: number | null) =>
    setDraft((d) => {
      const next = { ...d };
      if (groupId === r.groupId) delete next[r.userId];
      else next[r.userId] = groupId;
      return next;
    });
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
          toast.success(
            `Assigned ${result.assigned}, unassigned ${result.unassigned}.` +
              (skipped > 0 ? ` ${skipped} skipped — no longer active in this season.` : ""),
          );
        },
        onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save the roster.")),
      },
    );
  };

  const q = query.trim().toLowerCase();
  const rows = roster.data.filter(
    (r) =>
      q === "" || (r.name ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
  );
  const groupItems: Record<string, string> = {
    [NONE]: ROSTER_UNASSIGNED_LABEL,
    ...Object.fromEntries(groups.data.map((g) => [String(g.id), g.name])),
  };

  return (
    <View className="flex-col gap-3">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Text className="min-w-0 text-sm text-muted-foreground">
          {changes.length === 0
            ? "No unsaved changes"
            : `${changes.length} unsaved change${changes.length === 1 ? "" : "s"}`}
        </Text>
        <Button className="shrink-0" disabled={save.isPending || changes.length === 0} onPress={onSave}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </View>
      <Input
        accessibilityLabel="Search students"
        placeholder="Search students"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />
      <View className="flex-col gap-2">
        {rows.map((r) => {
          const label = r.name ?? r.email;
          const current = choice(r);
          const dirty = r.userId in draft;
          return (
            <View
              key={r.userId}
              className={cn(
                "flex-col gap-2 rounded-lg border bg-card p-3",
                dirty ? "border-brand-teal-400" : "border-border",
              )}
            >
              <View className="min-w-0">
                <Text numberOfLines={1} className="font-medium text-foreground">
                  {label}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                  {r.email}
                </Text>
                {r.otherSeasonGroup ? (
                  <Text className="mt-1 text-xs text-muted-foreground">
                    {`Also in ${r.otherSeasonGroup.groupName} (${r.otherSeasonGroup.seasonCode}) — assigning here moves them.`}
                  </Text>
                ) : null}
              </View>
              <Select
                items={groupItems}
                value={current === null ? NONE : String(current)}
                onValueChange={(v) => pick(r, v === NONE ? null : Number(v))}
              >
                <SelectTrigger accessibilityLabel={`Group for ${label}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{ROSTER_UNASSIGNED_LABEL}</SelectItem>
                  {groups.data.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** v1 admin/season/[code]/roster — `roster/import.tsx` (Plan 17) hangs off the "Import assignments" button. */
export default function SeasonRosterScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const season = useSeasonByCode(code);
  const roster = useSeasonRoster(season.data?.canAdminister ? season.data.id : null);

  let body: ReactNode;
  if (code === null)
    body = <EmptyState title="Not found" description="That season link isn't valid." />;
  else if (season.isPending) body = <RouteSkeleton />;
  else if (season.isError) body = <RouteError onRetry={() => void season.refetch()} />;
  else if (!season.data.canAdminister)
    body = (
      <EmptyState
        title="Not available"
        description="Only this season's admins can manage its roster."
      />
    );
  else
    body = (
      <RosterGrid
        seasonId={season.data.id}
        onNewGroup={() =>
          router.push({ pathname: "/group/new", params: { seasonId: String(season.data.id) } })
        }
      />
    );

  const count = roster.data?.length;
  return (
    <ShellFrame>
      <View className="flex-col gap-4">
        <View className="flex-row flex-wrap items-start justify-between gap-4">
          <PageTitle
            className="min-w-[150px] flex-1"
            title="Assign to groups"
            subtitle={
              season.data && count !== undefined
                ? `${count} student${count === 1 ? "" : "s"} in ${season.data.title}. Set each student's group and save.`
                : undefined
            }
          />
          {/* Spec 16 §9 / v1 roster/page.tsx:42: same predicate as the grid — the
              server's own canAdminister, not a client re-derivation. */}
          {code !== null && season.data?.canAdminister ? (
            <Button
              variant="outline"
              onPress={() =>
                router.push({ pathname: "/seasons/[code]/roster/import", params: { code } })
              }
            >
              Import assignments
            </Button>
          ) : null}
        </View>
        {body}
      </View>
    </ShellFrame>
  );
}
