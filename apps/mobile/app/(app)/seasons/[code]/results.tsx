import { useState, type ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";

import type { SeasonResultRow } from "@space/shared";

import { RouteError, RouteSkeleton, SeasonLinkNotFound } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState, GroupedList, ListRow, StatusChip } from "../../../../src/design/ui";
import { useSeasonResults, useUpdateSeasonResult } from "../../../../src/hooks/use-season-end";
import { useSeasonRoute } from "../../../../src/hooks/use-season-route";
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "../../../../src/lib/api-error";
import { parsePositiveInt } from "../../../../src/lib/params";
import { ResultSheet } from "../../../../src/screens/season-end/result-sheet";
import { resultRowView } from "../../../../src/screens/season-end/results-model";
import { blankToNull } from "../../../../src/lib/form-values";
import { haptic } from "../../../../src/design/motion";

/**
 * Every student's result in a finished season, and corrections: a super, or the season's (former)
 * admin. `?id=` names the season when the caller can't open its page any more (an admin after End,
 * from Reports' History); otherwise the season is read by its code. The season header comes from
 * the results. A student with no result (graduated mid-season, or no verdict) reads "No result" and
 * can be given one here. Anyone else is answered 403: "Not available".
 */
export default function SeasonResultsScreen() {
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const givenId = parsePositiveInt(rawId);
  const { code, season } = useSeasonRoute({ enabled: givenId === null });
  const seasonId = givenId ?? season.data?.id ?? null;
  const results = useSeasonResults(seasonId);
  const update = useUpdateSeasonResult(seasonId);
  const [editing, setEditing] = useState<SeasonResultRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const header = results.data?.season;

  const save = (draft: { result: "PASSED" | "NOT_PASSED"; reason: string }) => {
    if (!editing) return;
    setError(null);
    update.mutate(
      { userId: editing.userId, result: draft.result, reason: blankToNull(draft.reason) },
      {
        onSuccess: () => {
          haptic("success");
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
  if (givenId === null && code === null) body = <SeasonLinkNotFound />;
  else if (results.isError && apiErrorStatus(results.error) === 403)
    body = (
      <EmptyState
        title="Not available"
        description="Only the season's admin or a super admin can see and correct its results."
      />
    );
  else if (season.isError || results.isError)
    body = <RouteError onRetry={() => void (season.isError ? season.refetch() : results.refetch())} />;
  else if (!results.data) body = <RouteSkeleton />;
  else if (results.data.results.length === 0)
    body = <EmptyState title="No students" description="No student finished this season." />;
  else {
    const { criteria } = results.data;
    body = (
      <GroupedList>
        {results.data.results.map((r) => {
          const view = resultRowView(r, criteria);
          return (
            <ListRow
              key={r.userId}
              title={r.name}
              subtitle={view.lines.join("\n")}
              subtitleLines={null}
              trailing={<StatusChip tone={view.chip.tone} label={view.chip.label} />}
              trailingLabel={view.chip.label}
              trailingPlacement="below"
              chevron
              onPress={() => {
                setError(null);
                setEditing(r);
              }}
            />
          );
        })}
      </GroupedList>
    );
  }

  return (
    <Screen title="Results" subtitle={header?.title ?? season.data?.title}>
      {body}
      <ResultSheet
        student={editing}
        initial={{ result: editing?.result ?? "PASSED", reason: editing?.reason ?? "" }}
        graduation={
          editing && header?.graduatesOnPass
            ? { isAlumnus: editing.isAlumnus, stored: editing.result, year: header.year }
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
