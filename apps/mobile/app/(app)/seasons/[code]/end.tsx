import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { SeasonEndCheck } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { SaveBar } from "../../../../src/design/layout/save-bar";
import { Screen } from "../../../../src/design/layout/screen";
import { Button, ConfirmDialog, EmptyState, toast } from "../../../../src/design/ui";
import { useEndSeason, useSeasonEndCheck } from "../../../../src/hooks/use-season-end";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { apiErrorCode, apiErrorMessage } from "../../../../src/lib/api-error";
import { BlockersList } from "../../../../src/screens/season-end/blockers-list";
import { ResultSheet, type ResultDraft } from "../../../../src/screens/season-end/result-sheet";
import { ReviewList } from "../../../../src/screens/season-end/review-list";
import { useSessionStore } from "../../../../src/store/session";

type Student = SeasonEndCheck["students"][number];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const PASSED: ResultDraft = { result: "PASSED", reason: "" };

/**
 * End a season (staff): finish what blocks it, review every student's result
 * (everyone passes unless marked), confirm. The POST carries only the students
 * marked not passed. The end invalidates the ending staff member's token on the
 * server, so a season admin loses this season at once: they go to Today, a
 * super admin stays and sees it finished.
 */
export default function EndSeasonScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const season = useSeasonByCode(code);
  const seasonId = season.data?.id ?? null;
  const check = useSeasonEndCheck(seasonId);
  const end = useEndSeason(seasonId ?? 0);
  const [staged, setStaged] = useState<Record<number, ResultDraft>>({});
  const [editing, setEditing] = useState<Student | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [alreadyEnded, setAlreadyEnded] = useState(false);

  const notPassed = Object.entries(staged)
    .filter(([, d]) => d.result === "NOT_PASSED")
    .map(([id, d]) => ({ userId: Number(id), reason: d.reason.trim() === "" ? null : d.reason.trim() }));

  const onConfirm = () => {
    end.mutate(
      { notPassed },
      {
        onSuccess: () => {
          setConfirming(false);
          toast.success(`${season.data?.title ?? "The season"} has ended.`);
          if (isSuper) router.back();
          else router.dismissAll();
        },
        onError: (err) => {
          setConfirming(false);
          const errCode = apiErrorCode(err);
          if (errCode === "season_not_active") {
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
    body = <EmptyState title="Not found" description="That season link isn't valid." />;
  } else if (alreadyEnded || failedCode === "season_not_active") {
    body = (
      <EmptyState
        title="Already ended"
        description="Someone else already ended this season."
        action={<Button variant="secondary" onPress={() => (isSuper ? router.back() : router.dismissAll())}>Done</Button>}
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
    const blocked =
      blockers.submissions.length + blockers.quizAttempts.length + blockers.attendance.length > 0;
    if (blocked) {
      body = <BlockersList blockers={blockers} />;
    } else {
      body = <ReviewList students={students} staged={staged} onOpen={setEditing} />;
      footer = (
        <SaveBar
          label="End season"
          variant="destructive"
          loading={end.isPending}
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
  const description =
    `This finishes ${title} for ${plural(total, "student", "students")}` +
    (notPassed.length > 0 ? `, including ${notPassed.length} who did not pass` : "") +
    ". Their leaders and admins lose access.";

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
