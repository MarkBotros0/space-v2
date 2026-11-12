import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import type { SeasonEndCheck } from "@space/shared";

import {
  RouteError,
  RouteSkeleton,
  SeasonLinkNotFound,
  type GateQuery,
} from "../../../../src/design/layout/route-states";
import { SaveBar } from "../../../../src/design/layout/save-bar";
import { Screen } from "../../../../src/design/layout/screen";
import { Button, ConfirmDialog, EmptyState, toast } from "../../../../src/design/ui";
import { useEndSeason, useSeasonEndCheck } from "../../../../src/hooks/use-season-end";
import { useSeasonRoute } from "../../../../src/hooks/use-season-route";
import { apiErrorCode, apiErrorMessage } from "../../../../src/lib/api-error";
import { BlockersList } from "../../../../src/screens/season-end/blockers-list";
import { CriteriaStep } from "../../../../src/screens/season-end/criteria-step";
import { confirmCopy, ignoredNumbers } from "../../../../src/screens/season-end/end-review-model";
import { ResultSheet } from "../../../../src/screens/season-end/result-sheet";
import { ReviewList } from "../../../../src/screens/season-end/review-list";
import { useEndReview } from "../../../../src/screens/season-end/use-end-review";
import { CriteriaSheet } from "../../../../src/screens/season-passing/criteria-sheet";
import { useIsSuper } from "../../../../src/store/session";
import { plural } from "../../../../src/lib/plural";

type Student = SeasonEndCheck["students"][number];

/**
 * End a season (staff): finish what blocks it, then the review: the pass criteria (the season's,
 * changeable for this End), every student with their score, pre-selected Passed when it reaches the
 * mark, and a confirm saying how many pass. The POST carries the criteria, the scores shown, who
 * doesn't pass and the notes: a season changed since (a roster, a flag, a score) is refused and the
 * check reloads, keeping the admin's choices (`useEndReview`). The end invalidates the ending staff
 * member's token on the server, so a season admin loses this season at once: they go to Today, a
 * super admin stays and sees it finished.
 */
/**
 * What the screen shows instead of the review, in this order: a bad link, already ended (by this
 * screen's own refused end, or the check), the season failed, either query loading (the check's
 * failure wins), the check failed. Null once the check is in (refactor FE-003).
 */
function endGate(p: {
  code: string | null;
  alreadyEnded: boolean;
  season: GateQuery;
  check: GateQuery & { error: unknown };
  onDone: () => void;
}): ReactNode | null {
  const failedCode = p.check.isError ? apiErrorCode(p.check.error) : null;
  if (p.code === null) return <SeasonLinkNotFound />;
  if (p.alreadyEnded || failedCode === "season_not_active") {
    return (
      <EmptyState
        title="Already ended"
        description="Someone else already ended this season."
        action={
          <Button variant="secondary" onPress={p.onDone}>
            Done
          </Button>
        }
      />
    );
  }
  if (p.season.isError) return <RouteError onRetry={() => void p.season.refetch()} />;
  if (p.season.isPending || p.check.isPending) {
    return p.check.isError ? <RouteError onRetry={() => void p.check.refetch()} /> : <RouteSkeleton />;
  }
  if (p.check.isError) return <RouteError onRetry={() => void p.check.refetch()} />;
  return null;
}

export default function EndSeasonScreen() {
  const router = useRouter();
  const { code, season } = useSeasonRoute();
  const isSuper = useIsSuper();
  const seasonId = season.data?.id ?? null;
  const check = useSeasonEndCheck(seasonId);
  const end = useEndSeason(seasonId);
  const review = useEndReview(check.data);
  const [editing, setEditing] = useState<Student | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [alreadyEnded, setAlreadyEnded] = useState(false);

  const onConfirm = () => {
    const body = review.request();
    if (!body) return;
    end.mutate(body, {
      onSuccess: ({ graduated }) => {
        setConfirming(false);
        const ended = `${season.data?.title ?? "The season"} has ended.`;
        toast.success(graduated > 0 ? `${ended} ${plural(graduated, "person", "people")} graduated.` : ended);
        if (isSuper) router.back();
        else router.dismissAll();
      },
      onError: (err) => {
        setConfirming(false);
        const errCode = apiErrorCode(err);
        // A loser arriving after the winner's commit has lost this season from
        // its token by the retry, so it is refused rather than told "not active".
        if (errCode === "season_not_active" || errCode === "forbidden") {
          setAlreadyEnded(true);
        } else if (errCode === "season_unfinished") {
          // The roster, the flag or a score changed: reload, keeping the admin's choices.
          toast.error(apiErrorMessage(err, "Something changed. Check the list again."));
          void check.refetch();
        } else {
          toast.error(apiErrorMessage(err, "Couldn't end the season."));
        }
      },
    });
  };

  const gate = endGate({
    code,
    alreadyEnded,
    season,
    check,
    onDone: () => (isSuper ? router.back() : router.dismissAll()),
  });
  const data = check.data;
  const blockers = data?.blockers;
  const blocked =
    !!blockers && blockers.submissions.length + blockers.quizAttempts.length + blockers.attendance.length > 0;
  const anything = !!data && (data.available.attendance || data.available.assignments || data.available.quizzes);

  let body: ReactNode = gate;
  let footer: ReactNode = undefined;
  if (gate === null && blockers && blocked) {
    body = <BlockersList blockers={blockers} />;
  } else if (gate === null && data && review.criteria) {
    body = (
      <View className="flex-col gap-5">
        <CriteriaStep
          criteria={review.criteria}
          isDefault={data.isDefault}
          changed={review.changed}
          ignored={ignoredNumbers(data)}
          anything={anything}
          onChange={() => setCriteriaOpen(true)}
        />
        <ReviewList
          students={data.students}
          rows={review.rows}
          selection={review.selection}
          criteria={review.criteria}
          graduating={data.graduatesOnPass}
          year={season.data?.year ?? null}
          onOpen={setEditing}
          onSelectOnTrack={review.selectAllOnTrack}
          onClear={review.clear}
        />
      </View>
    );
    footer = (
      <SaveBar
        label="End season"
        variant="destructive"
        loading={end.isPending}
        disabled={end.isSuccess}
        onPress={() => setConfirming(true)}
        hint={
          review.notPass > 0 ? `${plural(review.notPass, "student", "students")} will not pass.` : "Everyone will pass."
        }
      />
    );
  }

  const copy = confirmCopy({
    title: season.data?.title ?? "this season",
    pass: review.pass,
    notPass: review.notPass,
    graduating: !!data?.graduatesOnPass,
    year: season.data?.year ?? null,
  });
  const editingRow = editing ? review.rows.find((r) => r.userId === editing.userId) : undefined;

  return (
    <Screen title="End season" subtitle={season.data?.title} footer={footer}>
      {body}
      <ResultSheet
        student={editing}
        initial={{
          result: editing ? (review.selection[editing.userId] ?? "PASSED") : "PASSED",
          reason: editing ? (review.notes[editing.userId] ?? "") : "",
        }}
        onTrack={editingRow?.onTrack ?? null}
        saveLabel="Done"
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          if (editing) review.choose(editing.userId, draft);
          setEditing(null);
        }}
      />
      {data && review.criteria ? (
        <CriteriaSheet
          open={criteriaOpen}
          initial={review.criteria}
          available={data.available}
          readOnly={false}
          saveLabel="Use these criteria"
          onSave={(c) => {
            review.setCriteria(c);
            setCriteriaOpen(false);
          }}
          onClose={() => setCriteriaOpen(false)}
        />
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={copy.title}
        description={copy.description}
        confirmLabel="End season"
        destructive
        pending={end.isPending}
        onConfirm={onConfirm}
      />
    </Screen>
  );
}
