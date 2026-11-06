import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { StartIssue } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { SaveBar } from "../../../../src/design/layout/save-bar";
import { Screen } from "../../../../src/design/layout/screen";
import { ConfirmDialog, EmptyState, Text, toast } from "../../../../src/design/ui";
import { useRemoveSeasonAdmin } from "../../../../src/hooks/use-season-admins";
import { useOverrideEnrollment, useSeasonStartCheck, useStartSeason } from "../../../../src/hooks/use-season-start";
import { useRemoveSeasonPerson } from "../../../../src/hooks/use-season-people";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { apiErrorCode, apiErrorMessage } from "../../../../src/lib/api-error";
import { IssueList } from "../../../../src/screens/season-start/issue-list";
import { useSessionStore } from "../../../../src/store/session";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Start a draft season (SUPER): clear what blocks it, then start. The check is
 * the server's live answer; every action refetches it and Start appears only
 * when it is empty. Starting is refused again server-side, so a race (someone
 * changed meanwhile) reloads the list with the reason.
 */
export default function StartSeasonScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const season = useSeasonByCode(code);
  const seasonId = season.data?.id ?? null;
  const isDraft = season.data?.status === "DRAFT";
  const check = useSeasonStartCheck(isSuper && isDraft ? seasonId : null);
  const start = useStartSeason(seasonId ?? 0);
  const removePerson = useRemoveSeasonPerson(seasonId ?? 0);
  const removeAdmin = useRemoveSeasonAdmin(seasonId ?? 0);
  const override = useOverrideEnrollment(seasonId ?? 0);
  const [confirming, setConfirming] = useState(false);
  const [overriding, setOverriding] = useState<StartIssue | null>(null);

  const onStart = () => {
    start.mutate(undefined, {
      onSuccess: (res) => {
        setConfirming(false);
        toast.success(`${season.data?.title ?? "The season"} has started.`);
        router.replace({ pathname: "/seasons/[code]", params: { code: res.season.code } });
      },
      onError: (err) => {
        setConfirming(false);
        const errCode = apiErrorCode(err);
        if (errCode === "start_blocked") {
          toast.error("Something changed. Check the list again.");
          void check.refetch();
        } else if (errCode === "not_draft") {
          void season.refetch();
        } else {
          toast.error(apiErrorMessage(err, "Couldn't start the season."));
        }
      },
    });
  };

  const refetchAfterError = (err: unknown, fallback: string) => {
    toast.error(apiErrorMessage(err, fallback));
    void check.refetch();
  };

  const onRemove = (issue: StartIssue) => {
    const opts = { onError: (err: unknown) => refetchAfterError(err, `Couldn't remove ${issue.name}.`) };
    if (issue.seat === "admin") removeAdmin.mutate({ userId: issue.userId }, opts);
    else removePerson.mutate({ userId: issue.userId }, opts);
  };

  const onOverride = () => {
    if (!overriding) return;
    const issue = overriding;
    override.mutate(
      { userId: issue.userId },
      {
        onSuccess: () => setOverriding(null),
        onError: (err) => {
          setOverriding(null);
          refetchAfterError(err, `Couldn't override for ${issue.name}.`);
        },
      },
    );
  };

  const busy = removePerson.isPending || removeAdmin.isPending || override.isPending || check.isFetching;
  const title = season.data?.title ?? "this season";
  const started = <EmptyState title="Already started" description="This season has already started." />;

  let body: ReactNode;
  let footer: ReactNode = undefined;
  if (code === null) {
    body = <EmptyState title="Not found" description="That season link isn't valid." />;
  } else if (!isSuper) {
    body = <EmptyState title="Not available" description="Only a super admin can start a season." />;
  } else if (season.isError) {
    body = <RouteError onRetry={() => void season.refetch()} />;
  } else if (season.isPending) {
    body = <RouteSkeleton />;
  } else if (!isDraft || apiErrorCode(check.error) === "not_draft") {
    body = started;
  } else if (check.isError) {
    body = <RouteError onRetry={() => void check.refetch()} />;
  } else if (check.isPending) {
    body = <RouteSkeleton />;
  } else if (check.data.ready) {
    body = (
      <Text variant="body">
        {`Everyone's clear. Starting makes this season live for ${plural(season.data.studentCount, "person", "people")}.`}
      </Text>
    );
    footer = (
      <SaveBar
        label="Start season"
        loading={start.isPending}
        disabled={start.isSuccess}
        onPress={() => setConfirming(true)}
      />
    );
  } else {
    body = (
      <IssueList
        items={check.data.items}
        actions={{
          seasonCode: code,
          seasonTitle: title,
          busy,
          onRemove,
          onOpenSeason: (c) => router.push({ pathname: "/seasons/[code]", params: { code: c } }),
          onOverride: setOverriding,
        }}
      />
    );
  }

  return (
    <Screen title={`Start ${title}`} footer={footer}>
      {body}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Start this season?"
        description={`${title} goes live. Everyone in it gets their role now.`}
        confirmLabel="Start season"
        pending={start.isPending}
        onConfirm={onStart}
      />
      <ConfirmDialog
        open={overriding !== null}
        onOpenChange={(open) => !open && setOverriding(null)}
        title="Override this block?"
        description={overriding ? `${overriding.message}. Override and let them in anyway?` : ""}
        confirmLabel="Override"
        pending={override.isPending}
        onConfirm={onOverride}
      />
    </Screen>
  );
}
