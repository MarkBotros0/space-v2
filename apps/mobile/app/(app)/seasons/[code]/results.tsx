import { useState, type ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";
import type { SeasonResultRow } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState, GroupedList, ListRow, StatusChip, toast } from "../../../../src/design/ui";
import { useSeasonResults, useUpdateSeasonResult } from "../../../../src/hooks/use-season-end";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { apiErrorCode, apiErrorMessage } from "../../../../src/lib/api-error";
import { joinMeta } from "../../../../src/lib/join-meta";
import { ResultSheet } from "../../../../src/screens/season-end/result-sheet";
import { useSessionStore } from "../../../../src/store/session";

/**
 * Super admin: every student's result in a finished season, and corrections.
 * A student with no result (graduated mid-season, or no verdict) reads "No
 * result" and can be given one here.
 */
export default function SeasonResultsScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const season = useSeasonByCode(code);
  const seasonId = isSuper ? (season.data?.id ?? null) : null;
  const results = useSeasonResults(seasonId);
  const update = useUpdateSeasonResult(seasonId ?? 0);
  const [editing, setEditing] = useState<SeasonResultRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = (draft: { result: "PASSED" | "NOT_PASSED"; reason: string }) => {
    if (!editing) return;
    setError(null);
    update.mutate(
      { userId: editing.userId, result: draft.result, reason: draft.reason.trim() === "" ? null : draft.reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Saved the result for ${editing.name}.`);
          setEditing(null);
        },
        onError: (err) => {
          const c = apiErrorCode(err);
          setError(
            c === "not_finished" ? "This season hasn't ended yet." : apiErrorMessage(err, "Couldn't save the result."),
          );
        },
      },
    );
  };

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" description="That season link isn't valid." />;
  else if (!isSuper)
    body = <EmptyState title="Not available" description="Only a super admin can see and correct results." />;
  else if (season.isError || results.isError)
    body = <RouteError onRetry={() => void (season.isError ? season.refetch() : results.refetch())} />;
  else if (season.isPending || results.isPending) body = <RouteSkeleton />;
  else if (results.data.length === 0)
    body = <EmptyState title="No students" description="No student finished this season." />;
  else
    body = (
      <GroupedList>
        {results.data.map((r) => (
          <ListRow
            key={r.userId}
            title={r.name}
            subtitle={joinMeta([r.groupName, `${r.attendancePct}% attendance`, r.reason])}
            trailing={
              <StatusChip
                tone={r.result === "PASSED" ? "ok" : r.result === "NOT_PASSED" ? "bad" : "neutral"}
                label={r.result === "PASSED" ? "Passed" : r.result === "NOT_PASSED" ? "Did not pass" : "No result"}
              />
            }
            trailingLabel={r.result === "PASSED" ? "Passed" : r.result === "NOT_PASSED" ? "Did not pass" : "No result"}
            chevron
            onPress={() => {
              setError(null);
              setEditing(r);
            }}
          />
        ))}
      </GroupedList>
    );

  return (
    <Screen title="Results" subtitle={season.data?.title}>
      {body}
      <ResultSheet
        student={editing}
        initial={{ result: editing?.result ?? "PASSED", reason: editing?.reason ?? "" }}
        graduation={
          editing && season.data?.graduatesOnPass
            ? { isAlumnus: editing.isAlumnus, stored: editing.result, year: season.data.year }
            : undefined
        }
        saveLabel="Save result"
        saving={update.isPending}
        error={error}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </Screen>
  );
}
