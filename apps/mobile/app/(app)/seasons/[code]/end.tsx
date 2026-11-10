import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import type { SeasonEndCheck } from "@space/shared";

import { RouteError, RouteSkeleton, SeasonLinkNotFound } from "../../../../src/design/layout/route-states";
import { SaveBar } from "../../../../src/design/layout/save-bar";
import { Screen } from "../../../../src/design/layout/screen";
import { Button, ConfirmDialog, EmptyState, toast } from "../../../../src/design/ui";
import { useEndSeason, useSeasonEndCheck } from "../../../../src/hooks/use-season-end";
import { useSeasonRoute } from "../../../../src/hooks/use-season-route";
import { apiErrorCode, apiErrorMessage } from "../../../../src/lib/api-error";
import { BlockersList } from "../../../../src/screens/season-end/blockers-list";
import { ResultSheet, type ResultDraft } from "../../../../src/screens/season-end/result-sheet";
import { ReviewList } from "../../../../src/screens/season-end/review-list";
import { useIsSuper } from "../../../../src/store/session";
import { blankToNull } from "../../../../src/lib/form-values";
import { plural } from "../../../../src/lib/plural";

type Student = SeasonEndCheck["students"][number];

const PASSED: ResultDraft = { result: "PASSED", reason: "" };

/**
 * End a season (staff): finish what blocks it, review every student's result
 * (everyone passes unless marked), confirm. The POST carries the students marked
 * not passed and what was reviewed: a season changed since then is refused and
 * the check reloads, keeping what was staged. The end invalidates the ending staff member's token on the
 * server, so a season admin loses this season at once: they go to Today, a
 * super admin stays and sees it finished.
 */
export default function EndSeasonScreen() {
  const router = useRouter();
  const { code, season } = useSeasonRoute();
  const isSuper = useIsSuper();
  const seasonId = season.data?.id ?? null;
  const check = useSeasonEndCheck(seasonId);
  const end = useEndSeason(seasonId);
  const [staged, setStaged] = useState<Record<number, ResultDraft>>({});
  const [editing, setEditing] = useState<Student | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [alreadyEnded, setAlreadyEnded] = useState(false);

  // Only who's on the review now: someone dropped since can't be sent, or the retry is refused.
  const reviewedIds = check.data?.students.map((s) => s.userId) ?? [];
  const notPassed = Object.entries(staged)
    .filter(([id, d]) => d.result === "NOT_PASSED" && reviewedIds.includes(Number(id)))
    .map(([id, d]) => ({ userId: Number(id), reason: blankToNull(d.reason) }));

  const onConfirm = () => {
    if (!check.data) return;
    end.mutate(
      { notPassed, reviewed: { graduatesOnPass: check.data.graduatesOnPass, userIds: reviewedIds } },
      {
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
            toast.error(apiErrorMessage(err, "Something changed. Check the list again."));
            void check.refetch();
          } else {
            toast.error(apiErrorMessage(err, "Couldn't end the season."));
          }
        },
      },
    );
  };

  const keyFor = (s: Student) => s.userId;
  const stage = (s: Student, draft: ResultDraft) => {
    setStaged((cur) => {
      const next = { ...cur };
      if (draft.result === "PASSED") delete next[keyFor(s)];
      else next[keyFor(s)] = draft;
      return next;
    });
    setEditing(null);
  };

  let body: ReactNode;
  let footer: ReactNode = undefined;
  const failedCode = check.isError ? apiErrorCode(check.error) : null;
  if (code === null) {
    body = <SeasonLinkNotFound />;
  } else if (alreadyEnded || failedCode === "season_not_active") {
    body = (
      <EmptyState
        title="Already ended"
        description="Someone else already ended this season."
        action={
          <Button variant="secondary" onPress={() => (isSuper ? router.back() : router.dismissAll())}>
            Done
          </Button>
        }
      />
    );
  } else if (season.isError) {
    body = <RouteError onRetry={() => void season.refetch()} />;
  } else if (season.isPending || check.isPending) {
    body = check.isError ? <RouteError onRetry={() => void check.refetch()} /> : <RouteSkeleton />;
  } else if (check.isError) {
    body = <RouteError onRetry={() => void check.refetch()} />;
  } else {
    const { blockers, students } = check.data;
    const blocked = blockers.submissions.length + blockers.quizAttempts.length + blockers.attendance.length > 0;
    if (blocked) {
      body = <BlockersList blockers={blockers} />;
    } else {
      body = (
        <ReviewList
          students={students}
          staged={staged}
          graduating={check.data.graduatesOnPass}
          year={season.data?.year ?? null}
          onOpen={setEditing}
        />
      );
      footer = (
        <SaveBar
          label="End season"
          variant="destructive"
          loading={end.isPending}
          disabled={end.isSuccess}
          onPress={() => setConfirming(true)}
          hint={
            notPassed.length > 0
              ? `${plural(notPassed.length, "student", "students")} will not pass.`
              : "Everyone will pass."
          }
        />
      );
    }
  }

  const total = check.data?.students.length ?? 0;
  const title = season.data?.title ?? "this season";
  const graduating = check.data?.graduatesOnPass ? total - notPassed.length : 0;
  const description =
    `This finishes ${title}` +
    (notPassed.length > 0 ? `, and ${plural(notPassed.length, "student", "students")} did not pass` : "") +
    ". Their leaders and admins lose access." +
    ` This ends the season for ${plural(total, "person", "people")}.` +
    (graduating > 0 ? ` ${plural(graduating, "person", "people")} will graduate.` : "");

  return (
    <Screen title="End season" subtitle={season.data?.title} footer={footer}>
      {body}
      <ResultSheet
        student={editing}
        initial={editing ? (staged[editing.userId] ?? PASSED) : PASSED}
        saveLabel="Done"
        onClose={() => setEditing(null)}
        onSave={(draft) => editing && stage(editing, draft)}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="End this season?"
        description={description}
        confirmLabel="End season"
        destructive
        pending={end.isPending}
        onConfirm={onConfirm}
      />
    </Screen>
  );
}
