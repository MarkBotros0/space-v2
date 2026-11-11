/**
 * The student's assignment page (spec layout A): title, due date, the
 * instructions, then the checklist of parts and Submit in the pinned bar.
 * Submit unlocks only when every part is done, videos included, and the
 * caption above it names what is left. Each part opens on its own screen.
 */
import type { UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { canSubmit, submitBlockerLine, type AssignmentDetail, type PartWork } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { SaveBar } from "../../design/layout/save-bar";
import { Screen } from "../../design/layout/screen";
import { ConfirmDialog, RichTextView, StatusChip, Text } from "../../design/ui";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { usePullRefresh } from "../../hooks/use-pull-refresh";
import { useSubmitAssignment } from "../../hooks/use-submission";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDate, formatOrgDue, keepTogether } from "../../lib/format";
import { reportOutcome } from "../../lib/outcome";
import { storedTextToHtml } from "../../lib/stored-text";
import { AssignmentChecklist } from "./assignment-checklist";
import { waitForDraftWrites } from "./use-draft-flush";

const READ_ONLY = "This season has finished. You can read your work but not change it.";

/**
 * Submit's words, by the essays it hands in (review M5): the hint above the
 * enabled button and the confirmation. With no essay nothing goes to review.
 */
function submitCopy(essays: number): { hint: string; confirm: string } {
  if (essays === 0) {
    return {
      hint: "Every part is done. Submit to finish the assignment.",
      confirm: "This marks the assignment as finished.",
    };
  }
  if (essays === 1) {
    return {
      hint: "Your essay goes to your leader when you submit.",
      confirm: "Your essay goes to your leader for review, and you can't change it after you submit.",
    };
  }
  return {
    hint: "Your essays go to your leader when you submit.",
    confirm: "Your essays go to your leader for review, and you can't change them after you submit.",
  };
}

/**
 * Why Submit is disabled. A returned essay is not finished by Submit but by
 * "Hand in again" on its own screen, so the caption points there; otherwise
 * the shared blocker line names what is left.
 */
function submitBlocker(detail: AssignmentDetail, works: PartWork[]): string | null {
  if (canSubmit(detail.parts, works)) return null;
  const returned = works.filter((w) => w.kind === "ESSAY" && w.essay?.reviewStatus === "RETURNED").length;
  if (returned > 1) return "Open each returned essay and tap Hand in again";
  if (returned === 1) return "Open the returned essay and tap Hand in again";
  return submitBlockerLine(detail.parts, works);
}

/** The due date in words, with "Overdue" beside it while there is still something to hand in. */
function DueLine({ detail }: { detail: AssignmentDetail }) {
  const owed = !detail.readOnly && detail.my?.submittedAt == null;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {detail.isOverdue && owed ? <StatusChip tone="bad" label="Overdue" /> : null}
      <Text variant="subhead" className="min-w-0 shrink text-muted-foreground">
        {/* The server's org-clock day and time (C2/X13), never dueAt in the device's zone. */}
        {detail.dueOrgDay === null ? "No due date" : `Due ${formatOrgDue(detail.dueOrgDay, detail.dueOrgTime)}`}
      </Text>
    </View>
  );
}

/** Submit, its confirmation and its refusals. Pending disables it, so one tap is one Submit. */
function useSubmit(detail: AssignmentDetail) {
  // A draft flushed on leaving an essay lands before Submit hands it in (review M2).
  const submit = useSubmitAssignment(detail.id, { beforeSend: waitForDraftWrites });
  const [confirming, setConfirming] = useState(false);
  // isPending reaches the buttons a tick after the press, so a quick second tap is held here.
  const inFlight = useRef(false);
  const confirm = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    submit.mutate(undefined, {
      onSuccess: () => reportOutcome("success", "Submitted!"),
      // not_finished carries the blocker line, already_submitted its own words; the hook re-reads either way.
      onError: (err) =>
        reportOutcome("error", apiErrorMessage(err, "Couldn't submit. Check your connection and try again.")),
      onSettled: () => {
        inFlight.current = false;
        setConfirming(false);
      },
    });
  };
  return { submit, confirming, setConfirming, confirm };
}

function StudentAssignment({ detail, refresh }: { detail: AssignmentDetail; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const pull = usePullRefresh(refresh);
  const { submit, confirming, setConfirming, confirm } = useSubmit(detail);
  const works = detail.my?.parts ?? [];
  const submittedAt = detail.my?.submittedAt ?? null;
  const ready = canSubmit(detail.parts, works);
  const blocker = submitBlocker(detail, works);
  const copy = submitCopy(detail.parts.filter((p) => p.kind === "ESSAY").length);
  const offerSubmit = !detail.readOnly && submittedAt === null && detail.parts.length > 0;

  const footer = offerSubmit ? (
    <SaveBar
      label="Submit"
      onPress={() => setConfirming(true)}
      loading={submit.isPending}
      disabled={!ready || submit.isPending}
      disabledReason={blocker ?? undefined}
      hint={blocker ?? copy.hint}
    />
  ) : undefined;

  return (
    <Screen
      title={detail.title}
      subtitle={detail.seasonTitle}
      onRefresh={pull.onRefresh}
      refreshing={pull.refreshing}
      footer={footer}
    >
      <View className="gap-4">
        <DueLine detail={detail} />
        {submittedAt !== null ? (
          <Text variant="subhead">{`Submitted ${keepTogether(formatDate(submittedAt))}`}</Text>
        ) : null}
        {detail.readOnly ? (
          <Text variant="subhead" className="rounded-group bg-surface p-4 text-muted-foreground">
            {READ_ONLY}
          </Text>
        ) : null}
        {detail.description ? (
          <View>
            <ListSectionHeader>Instructions</ListSectionHeader>
            {/* Descriptions hold v1's stored HTML or v2 plain text; never show raw tags (B3-16). */}
            <View className="rounded-group bg-surface p-4">
              <RichTextView html={storedTextToHtml(detail.description)} />
            </View>
          </View>
        ) : null}
        <AssignmentChecklist
          parts={detail.parts}
          works={works}
          onOpen={(part) =>
            router.push({
              pathname: "/assignment/[id]/part/[partId]",
              params: { id: String(detail.id), partId: String(part.id) },
            })
          }
        />
      </View>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Submit this assignment?"
        description={copy.confirm}
        confirmLabel="Yes, submit"
        cancelLabel="Not yet"
        pending={submit.isPending}
        onConfirm={confirm}
      />
    </Screen>
  );
}

/** The student's route body: loading and error states, then the detail. */
export function StudentAssignmentView({ query }: { query: UseQueryResult<AssignmentDetail> }) {
  // A failed pull keeps the page: swapping it out would lose the student's place.
  if (query.data === undefined) {
    return (
      <Screen title="Assignment">
        {query.isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void query.refetch()} />}
      </Screen>
    );
  }
  return <StudentAssignment detail={query.data} refresh={() => query.refetch()} />;
}
