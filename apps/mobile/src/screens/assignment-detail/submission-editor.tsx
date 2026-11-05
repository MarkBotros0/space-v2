/**
 * The student's submission on an assignment, split in two for `Screen`: the
 * `body` scrolls, the `footer` (a `SaveBar`) is pinned by `Screen` outside the
 * scroll view, so the text, the mutations and the confirmation live in one
 * hook above both. Nothing is created up front (C6): with no submission the
 * bar's primary is "Start working".
 */
import { File as FileIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { AccessibilityInfo, View } from "react-native";
import { plainTextToHtml, type AssignmentDetail, type SubmissionDetail } from "@space/shared";

import { RouteError } from "../../design/layout/route-states";
import { SaveBar } from "../../design/layout/save-bar";
import { cn } from "../../design/lib/cn";
import { useKeyboardHeight } from "../../design/lib/keyboard-events";
import { iconWithClassName } from "../../design/lib/icon";
import { GroupedList, ListRow, RichTextView, SkeletonCard, Text, Textarea } from "../../design/ui";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { ConfirmDialog } from "../../design/ui/confirm-dialog";
import {
  useEnsureSubmission,
  useSaveSubmission,
  useSubmissionDetail,
} from "../../hooks/use-submission";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDistanceOnly } from "../../lib/format";
import { reportOutcome } from "../../lib/outcome";
import { useDraftFlush } from "./use-draft-flush";

iconWithClassName(FileIcon);

const HINT = "A saved draft is private to you and is not sent to your leader until you submit.";
const NOTHING_TO_SUBMIT = "Write a response first";
const START_FAILED = "Couldn't start your submission. Try again.";

type Tone = "bad" | "warn" | "info";
const CALLOUT: Record<Tone, string> = {
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
};

function Callout({ tone, children }: { tone: Tone; children: string }) {
  return (
    <Text variant="subhead" className={cn("rounded-control p-3", CALLOUT[tone])}>
      {children}
    </Text>
  );
}

/**
 * v1 student-submission-form.tsx dueBanner; hidden once the work is in the
 * leader's hands, when there is nothing left to be late with. Returned work is
 * editable again, so it keeps it. The overdue flag is the server's.
 */
function DueBanner({ detail, status }: { detail: AssignmentDetail; status: string | null }) {
  if (detail.dueAt === null || status === "REVIEWED" || status === "SUBMITTED") return null;
  if (detail.isOverdue) {
    return <Callout tone="bad">Past due — submitted work will be marked late.</Callout>;
  }
  const urgent = Date.parse(detail.dueAt) - Date.now() < 86_400_000;
  return <Callout tone={urgent ? "warn" : "info"}>{`Due in ${formatDistanceOnly(detail.dueAt)}`}</Callout>;
}

function FilesGroup({ detail, sub }: { detail: AssignmentDetail; sub: SubmissionDetail }) {
  if (detail.maxFileSizeMb === null) return null;
  return (
    <View className="gap-2">
      {sub.files.length > 0 ? (
        <GroupedList header={`Files (max ${detail.maxFileSizeMb} MB each)`}>
          {sub.files.map((f) => (
            <ListRow
              key={f.originalName}
              title={f.originalName}
              titleLines={2}
              leading={<FileIcon size={16} className="text-muted-foreground" />}
              trailing={
                <Text variant="caption" tabular className="text-muted-foreground">
                  {`${(f.sizeBytes / 1024).toFixed(1)} KB`}
                </Text>
              }
              trailingLabel={`${(f.sizeBytes / 1024).toFixed(1)} KB`}
            />
          ))}
        </GroupedList>
      ) : (
        <ListSectionHeader>{`Files (max ${detail.maxFileSizeMb} MB each)`}</ListSectionHeader>
      )}
      {!sub.canUploadFiles ? (
        <Text variant="caption" className="text-muted-foreground">
          This assignment expects a file, but attachments aren't available in the app yet.
        </Text>
      ) : null}
    </View>
  );
}

export type SubmissionParts = { body: ReactNode; footer: ReactNode | undefined };

export function useSubmissionEditor(detail: AssignmentDetail): SubmissionParts {
  const summary = detail.mySubmission;
  const ensure = useEnsureSubmission(detail.id);
  const query = useSubmissionDetail(summary?.publicId ?? null);
  const save = useSaveSubmission(summary?.publicId ?? "", detail.id);
  const [text, setText] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const keyboardOpen = useKeyboardHeight() > 0;
  const send = useDraftFlush(
    save.mutateAsync,
    query.data
      ? {
          text,
          serverText: query.data.text ?? "",
          editable: query.data.status === "DRAFT" || query.data.status === "RETURNED",
        }
      : null,
  );

  if (summary === null) {
    return {
      body: (
        <View className="gap-4">
          <DueBanner detail={detail} status={null} />
          {ensure.isError ? <Callout tone="bad">{START_FAILED}</Callout> : null}
        </View>
      ),
      footer: (
        <SaveBar
          label="Start working"
          onPress={() =>
            ensure.mutate(undefined, {
              onError: () => AccessibilityInfo.announceForAccessibility(START_FAILED),
            })
          }
          loading={ensure.isPending}
        />
      ),
    };
  }
  // A section of the page, so a card-sized skeleton, not the route's.
  if (query.isPending) return { body: <SkeletonCard />, footer: undefined };
  // A failed pull keeps what's on screen: the editor, and what is typed in it.
  if (query.data === undefined) {
    return { body: <RouteError onRetry={() => void query.refetch()} />, footer: undefined };
  }

  const sub = query.data;
  // Local edits win once typing starts; before that, the server's text shows.
  const value = text ?? sub.text ?? "";
  // v2 keeps DRAFT/RETURNED as the editable states (B2-16).
  const editable = sub.status === "DRAFT" || sub.status === "RETURNED";
  // v1 student-submission-form.tsx:158 — and the server's 400 empty_submission rule.
  const nothingToSubmit = value.trim() === "" && sub.files.length === 0;
  const run = (submit: boolean) => {
    send(submit ? { text: value, submit: true } : { text: value })
      .then(() => reportOutcome("success", submit ? "Submitted!" : "Draft saved."))
      .catch((err: unknown) =>
        reportOutcome(
          "error",
          apiErrorMessage(
            err,
            `Couldn't ${submit ? "submit" : "save"}. Check your connection and try again.`,
          ),
        ),
      )
      .finally(() => setConfirming(false));
  };

  const body = (
    <View className="gap-4">
      <DueBanner detail={detail} status={sub.status} />
      <View className="gap-2">
        <ListSectionHeader>Your submission</ListSectionHeader>
        <View className="gap-3 rounded-group bg-surface p-4">
          {/* Plain text in and out: the API returns submissions as plain text, so a
              rich editor would lose its formatting on reload (gap note). */}
          {editable ? (
            <Textarea
              accessibilityLabel="Your response"
              placeholder="Write your response…"
              value={value}
              onChangeText={setText}
              className="min-h-32"
            />
          ) : (
            <RichTextView
              html={value ? plainTextToHtml(value) : null}
              emptyText="No written response."
            />
          )}
        </View>
      </View>
      <FilesGroup detail={detail} sub={sub} />
      {sub.feedback ? (
        <View className="gap-2">
          <ListSectionHeader>Leader feedback</ListSectionHeader>
          <View className="rounded-group bg-surface p-4">
            <RichTextView html={plainTextToHtml(sub.feedback)} />
          </View>
        </View>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Submit your work?"
        description={
          sub.status === "RETURNED"
            ? "Your leader will review this again. You won't be able to change it after you submit."
            : "Once you submit, you can't change it. Save a draft instead if you're not ready."
        }
        confirmLabel="Yes, submit"
        cancelLabel="Not yet"
        pending={save.isPending}
        onConfirm={() => run(true)}
      />
    </View>
  );

  const footer = editable ? (
    <SaveBar
      label="Submit"
      onPress={() => setConfirming(true)}
      disabled={save.isPending || nothingToSubmit}
      disabledReason={nothingToSubmit ? NOTHING_TO_SUBMIT : undefined}
      hint={nothingToSubmit ? `${NOTHING_TO_SUBMIT}. ${HINT}` : HINT}
      // Hint and two stacked buttons left ~90dp for the field with the keyboard up.
      compact={keyboardOpen}
      secondary={{
        label: save.isPending ? "Saving…" : "Save draft",
        onPress: () => run(false),
        disabled: save.isPending,
      }}
    />
  ) : undefined;
  return { body, footer };
}
