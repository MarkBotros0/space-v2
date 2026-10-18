import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import type { SeasonDetail } from "@space/shared";

import { SeasonForm, type SeasonFormValues } from "../../../../src/components/season/SeasonForm";
import { PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { iconWithClassName } from "../../../../src/design/lib/icon";
import { Button, Card, CardContent, EmptyState } from "../../../../src/design/ui";
import { ConfirmDialog } from "../../../../src/design/ui/confirm-dialog";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useDeleteSeason, useUpdateSeasonAsSuper } from "../../../../src/hooks/use-season-writes";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { useSessionStore } from "../../../../src/store/session";

iconWithClassName(Trash2);

const fromDetail = (s: SeasonDetail): SeasonFormValues => ({
  code: s.code,
  program: s.program,
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
    <View className="flex-col gap-4">
      <View className="flex-row items-start justify-between gap-4">
        <PageTitle
          className="min-w-0 flex-1"
          title={`Edit · ${season.title}`}
          subtitle={`Code: ${season.code}`}
        />
        <Button variant="destructive" size="sm" onPress={() => setConfirming(true)}>
          <Trash2 size={14} className="text-white" />
          Delete season
        </Button>
      </View>
      <Card>
        <CardContent className="pt-6">
          <SeasonForm
            mode="edit"
            initial={fromDetail(season)}
            submitting={update.isPending}
            message={message ?? deleteError}
            onCancel={() => router.back()}
            onSubmit={(body) => {
              setMessage(null);
              update.mutate(body, {
                // The code may have changed — every URL addressing the season moves (spec 02 D8).
                onSuccess: (ref) =>
                  router.replace({ pathname: "/seasons/[code]", params: { code: ref.code } }),
                onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the season.")),
              });
            }}
          />
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${season.title}"?`}
        description="The season will be hidden from lists. Existing groups, sessions, and attendance are preserved."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          setDeleteError(null);
          remove.mutate(season.id, {
            onSuccess: () => {
              setConfirming(false);
              router.replace("/seasons");
            },
            onError: (err) => {
              setConfirming(false);
              setDeleteError(apiErrorMessage(err, "Couldn't delete the season."));
            },
          });
        }}
      />
    </View>
  );
}

export default function SeasonEditScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const code = isSuper && typeof raw === "string" && raw.length > 0 ? raw : null;
  const detail = useSeasonByCode(code);

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
  } else if (detail.isPending) {
    body = <RouteSkeleton />;
  } else if (detail.isError) {
    body = <RouteError onRetry={() => void detail.refetch()} />;
  } else {
    // key: a refetch after save must not keep the old form state.
    body = <SeasonEdit key={`${detail.data.id}-${detail.data.code}`} season={detail.data} />;
  }

  return <ShellFrame>{body}</ShellFrame>;
}
