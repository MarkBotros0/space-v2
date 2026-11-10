/**
 * An essay part on its own screen: the question, the box with a live word
 * count against the range, the files, and Save draft. Essays are handed in by
 * the assignment's Submit; a returned one is handed in again here, on its own.
 * The text is local state until saved, so leaving or backgrounding flushes it
 * (`use-draft-flush.ts`).
 */
import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  essayWordCount,
  essayWordRangeMessage,
  type AssignmentDetail,
  type AssignmentPart,
  type PartWork,
  type SubmissionDetail,
} from "@space/shared";

import { RouteError } from "../../design/layout/route-states";
import { SaveBar } from "../../design/layout/save-bar";
import { Screen } from "../../design/layout/screen";
import { cn } from "../../design/lib/cn";
import { useKeyboardHeight } from "../../design/lib/keyboard-events";
import { ConfirmDialog, FormField, SkeletonCard, Text, Textarea } from "../../design/ui";
import { usePullRefresh } from "../../hooks/use-pull-refresh";
import { useHandInEssay, useSaveEssayDraft, useSubmissionDetail } from "../../hooks/use-submission";
import { apiErrorMessage } from "../../lib/api-error";
import { partStatusLine } from "../../lib/assignment-labels";
import { reportOutcome } from "../../lib/outcome";
import { essayCountLine } from "./essay-model";
import { EssayFiles, EssayText, LeaderFeedback, ReturnNote } from "./essay-sections";
import { useDraftFlush } from "./use-draft-flush";

type EssayPart = Extract<AssignmentPart, { kind: "ESSAY" }>;
type Status = SubmissionDetail["status"];

const DRAFT_HINT = "Your essay goes to your leader when you submit the assignment.";
const RETURNED_HINT = "Your leader reviews it again once you hand it in.";

function EssayCount({ part, text }: { part: EssayPart; text: string }) {
  const line = essayCountLine(essayWordCount(text), part.minWords, part.maxWords);
  return (
    <Text
      testID="essay-count"
      variant="caption"
      accessibilityLiveRegion="polite"
      className={cn(line.tone === "bad" ? "text-bad" : "text-muted-foreground")}
    >
      {line.text}
    </Text>
  );
}

type Parts = { body: ReactNode; footer: ReactNode | undefined };

/** The body and the pinned bar, from one hook so the text and the writes live above both. */
function useEssayEditor(detail: AssignmentDetail, part: EssayPart, work: PartWork | undefined): Parts {
  const publicId = work?.essay?.publicId ?? null;
  const query = useSubmissionDetail(publicId);
  const saveDraft = useSaveEssayDraft(detail.id, part.id);
  const handIn = useHandInEssay(publicId ?? "", detail.id);
  const [text, setText] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // isPending reaches the buttons a tick after the press, so a quick second tap on Hand in is held here.
  const handingIn = useRef(false);
  const keyboardOpen = useKeyboardHeight() > 0;

  const essay = query.data;
  const status: Status | null = essay?.status ?? work?.essay?.reviewStatus ?? null;
  // Nothing saved yet is a blank draft. A handed-in essay is locked (the server
  // refuses edits with submission_locked), and a finished season never edits.
  const editable = !detail.readOnly && (status === null || status === "DRAFT" || status === "RETURNED");
  const serverText = essay?.text ?? "";
  const known = publicId === null || essay !== undefined;

  const send = useDraftFlush(
    `${detail.id}:${part.id}`,
    async ({ text: value, submit }) => {
      // Hand in again sends the text first only when it changed.
      if (!submit || value !== serverText) await saveDraft.mutateAsync(value);
      if (submit) await handIn.mutateAsync();
    },
    known ? { text, serverText, editable } : null,
  );

  if (publicId === null && detail.readOnly) {
    return {
      body: (
        <Text variant="subhead" className="rounded-group bg-surface p-4 text-muted-foreground">
          You didn't write this essay.
        </Text>
      ),
      footer: undefined,
    };
  }
  // A section of the page, so a card-sized skeleton, not the route's.
  if (!known && query.isPending) return { body: <SkeletonCard />, footer: undefined };
  if (!known) return { body: <RouteError onRetry={() => void query.refetch()} />, footer: undefined };

  const value = text ?? serverText;
  const returned = status === "RETURNED";
  const pending = saveDraft.isPending || handIn.isPending;
  const rangeIssue = essayWordRangeMessage(essayWordCount(value), part.minWords, part.maxWords);
  const run = (submit: boolean) => {
    if (submit && handingIn.current) return;
    if (submit) handingIn.current = true;
    send(submit ? { text: value, submit: true } : { text: value })
      .then(() => reportOutcome("success", submit ? "Handed in again." : "Draft saved."))
      .catch((err: unknown) =>
        reportOutcome(
          "error",
          apiErrorMessage(err, `Couldn't ${submit ? "hand it in" : "save"}. Check your connection and try again.`),
        ),
      )
      .finally(() => {
        if (submit) handingIn.current = false;
        setConfirming(false);
      });
  };

  const note = returned ? (essay?.feedback ?? work?.essay?.feedback ?? null) : null;
  const body = (
    <View className="gap-4">
      {status !== null && status !== "DRAFT" ? (
        <Text variant="subhead" className="text-muted-foreground">
          {partStatusLine(part, work)}
        </Text>
      ) : null}
      {note ? <ReturnNote note={note} /> : null}
      {editable ? (
        <View className="gap-2 rounded-group bg-surface p-4">
          <FormField label={part.prompt}>
            <Textarea
              accessibilityLabel={part.prompt}
              placeholder="Write your essay…"
              value={value}
              onChangeText={setText}
              className="min-h-40"
            />
          </FormField>
          <EssayCount part={part} text={value} />
        </View>
      ) : (
        <EssayText prompt={part.prompt} text={essay?.text ?? null} />
      )}
      {essay ? <EssayFiles essay={essay} readOnly={detail.readOnly} /> : null}
      {status === "REVIEWED" && essay?.feedback ? <LeaderFeedback feedback={essay.feedback} /> : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Hand this essay in again?"
        description="Your leader will review it again. You can't change it after you hand it in."
        confirmLabel="Yes, hand it in"
        cancelLabel="Not yet"
        pending={handIn.isPending}
        onConfirm={() => run(true)}
      />
    </View>
  );

  if (!editable) return { body, footer: undefined };
  const saveLabel = saveDraft.isPending ? "Saving…" : "Save draft";
  const footer = returned ? (
    <SaveBar
      label="Hand in again"
      onPress={() => setConfirming(true)}
      disabled={pending || rangeIssue !== null}
      disabledReason={rangeIssue ?? undefined}
      hint={rangeIssue ?? RETURNED_HINT}
      // The hint left too little for the field with the keyboard up.
      compact={keyboardOpen}
      beside
      secondary={{ label: saveLabel, onPress: () => run(false), disabled: pending }}
    />
  ) : (
    <SaveBar label={saveLabel} onPress={() => run(false)} disabled={pending} hint={DRAFT_HINT} compact={keyboardOpen} />
  );
  return { body, footer };
}

export function EssayPartScreen({
  detail,
  part,
  refresh,
}: {
  detail: AssignmentDetail;
  part: EssayPart;
  refresh: () => Promise<unknown>;
}) {
  const work = detail.my?.parts.find((w) => w.partId === part.id);
  const { body, footer } = useEssayEditor(detail, part, work);
  const publicId = work?.essay?.publicId ?? null;
  const essay = useSubmissionDetail(publicId);
  // The pull reads the essay too, so its status and the note move with the checklist.
  // `enabled` gates only the automatic run, so the essay's read is guarded.
  const pull = usePullRefresh(() => Promise.all([refresh(), publicId !== null ? essay.refetch() : undefined]));
  return (
    <Screen
      title="Essay"
      subtitle={detail.title}
      onRefresh={pull.onRefresh}
      refreshing={pull.refreshing}
      footer={footer}
    >
      {body}
    </Screen>
  );
}
