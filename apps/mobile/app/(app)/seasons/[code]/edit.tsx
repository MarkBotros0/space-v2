import { useState, type ReactNode } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import type { SeasonDetail } from "@space/shared";

import { SeasonForm, type SeasonFormValues } from "../../../../src/components/season/SeasonForm";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { iconWithClassName } from "../../../../src/design/lib/icon";
import { Button, EmptyState } from "../../../../src/design/ui";
import { ConfirmDialog } from "../../../../src/design/ui/confirm-dialog";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useDeleteSeason, useUpdateSeasonAsSuper } from "../../../../src/hooks/use-season-writes";
import { apiErrorCode, apiErrorMessage } from "../../../../src/lib/api-error";
import { useSessionStore } from "../../../../src/store/session";

iconWithClassName(Trash2);

const fromDetail = (s: SeasonDetail): SeasonFormValues => ({
  code: s.code,
  program: s.program,
  requiredProgram: s.requiredProgram ?? "",
  graduatesOnPass: s.graduatesOnPass ?? false,
  year: String(s.year),
  description: s.description ?? "",
  // Season dates are calendar days stored as UTC midnight (spec 02 D12).
  startDay: s.startDate.slice(0, 10),
  endDay: s.endDate.slice(0, 10),
  status: s.status,
  budget: String(s.absenceBudgetMinutes),
  weight: String(s.absenceWeightMinutes),
});

/**
 * SUPER's season edit (v1 /super/seasons/[code]/edit, B5-2; spec 02 §9; G4).
 * Every identity field AND the status — v1's free four-way select (R17, Plan 6
 * D-16.4). The "Delete season" button sits in the header with v1's confirm
 * dialog (B5-5). The PATCH is Plan 3's SUPER full body, so the stored budgets
 * are pre-filled and always sent (D-16.3).
 */
function SeasonEdit({ season }: { season: SeasonDetail }) {
  const router = useRouter();
  const update = useUpdateSeasonAsSuper(season.id);
  const remove = useDeleteSeason();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <SeasonForm
      mode="edit"
      title={`Edit · ${season.title}`}
      subtitle={`Code: ${season.code}`}
      initial={fromDetail(season)}
      submitting={update.isPending}
      message={message ?? deleteError}
      onSubmit={(body) => {
        setMessage(null);
        update.mutate(body, {
          // The code may have changed — every URL addressing the season moves (spec 02 D8).
          // dismissTo pops back to the detail this was opened from and gives it the
          // (possibly new) code, so there is one season detail, at the right URL.
          onSuccess: (ref) =>
            router.dismissTo({ pathname: "/seasons/[code]", params: { code: ref.code } }),
          onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the season.")),
        });
      }}
    >
      <Button variant="destructive" className="self-start" onPress={() => setConfirming(true)}>
        <Trash2 size={14} className="text-bad" />
        Delete season
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${season.title}"?`}
        // Not v1's copy ("groups, sessions, and attendance are preserved"): the
        // server refuses a season with any session or enrollment
        // (season_in_use), so promising that would be false.
        description="Only an empty season can be deleted — one with no sessions and no enrollments. A season in use should be archived instead (Status: Archived)."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          setDeleteError(null);
          remove.mutate(season.id, {
            onSuccess: () => {
              setConfirming(false);
              // Pops this edit and the deleted season's detail under it.
              router.dismissTo("/seasons");
            },
            onError: (err) => {
              setConfirming(false);
              if (apiErrorCode(err) === "season_in_use") {
                // The common refusal, said where it can't be missed — the
                // form's message line sits below the fold on a phone.
                const text =
                  "This season has sessions or enrollments, so it can't be deleted. Archive it instead: set Status to Archived and save.";
                setDeleteError(text);
                Alert.alert("Season in use", text);
                return;
              }
              setDeleteError(apiErrorMessage(err, "Couldn't delete the season."));
            },
          });
        }}
      />
    </SeasonForm>
  );
}

export default function SeasonEditScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const code = isSuper && typeof raw === "string" && raw.length > 0 ? raw : null;
  const detail = useSeasonByCode(code);

  if (isSuper && code !== null && detail.isSuccess) {
    // key: a refetch after save must not keep the old form state.
    return <SeasonEdit key={`${detail.data.id}-${detail.data.code}`} season={detail.data} />;
  }

  let body: ReactNode;
  if (!isSuper) {
    body = (
      <EmptyState
        title="Not available"
        description="Only a super admin can edit a season's identity."
      />
    );
  } else if (code === null) {
    body = <EmptyState title="Not found" description="That season link isn't valid." />;
  } else if (detail.isError) {
    body = <RouteError onRetry={() => void detail.refetch()} />;
  } else {
    body = <RouteSkeleton />;
  }
  return <Screen title="Edit season">{body}</Screen>;
}
