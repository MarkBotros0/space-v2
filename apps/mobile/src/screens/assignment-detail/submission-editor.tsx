/**
 * The student's submission on an assignment, split in two for `Screen`: the
 * `body` scrolls, the `footer` (a `SaveBar`) is pinned by `Screen` outside the
 * scroll view, so the text, the mutations and the confirmation live in one
 * hook above both. Nothing is created up front (C6): with no submission the
 * bar's primary is "Start working".
 */
import { File as FileIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { plainTextToHtml, type AssignmentDetail, type SubmissionDetail } from "@space/shared";

import { Eyebrow } from "../../design/layout/page-title";
import { RouteError } from "../../design/layout/route-states";
import { SaveBar } from "../../design/layout/save-bar";
import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { GroupedList, ListRow, RichTextView, SkeletonCard, Text, Textarea } from "../../design/ui";
import { ConfirmDialog } from "../../design/ui/confirm-dialog";
import {
  useEnsureSubmission,
  useSaveSubmission,
  useSubmissionDetail,
} from "../../hooks/use-submission";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDistanceOnly } from "../../lib/format";

iconWithClassName(FileIcon);

const HINT = "A saved draft is private to you and is not sent to your leader until you submit.";

type Tone = "bad" | "warn" | "ok" | "info";
const CALLOUT: Record<Tone, string> = {
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  info: "bg-info-soft text-info",
};

function Callout({ tone, children }: { tone: Tone; children: string }) {
  return (
    <Text variant="subhead" className={cn("rounded-control p-3", CALLOUT[tone])}>
      {children}
    </Text>
  );
}

/** v1 student-submission-form.tsx dueBanner; hidden once reviewed. The overdue flag is the server's. */
function DueBanner({ detail, status }: { detail: AssignmentDetail; status: string | null }) {
  if (detail.dueAt === null || status === "REVIEWED") return null;
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
        <Eyebrow>{`Files (max ${detail.maxFileSizeMb} MB each)`}</Eyebrow>
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
  const [info, setInfo] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (summary === null) {
    return {
      body: (
        <View className="gap-4">
          <DueBanner detail={detail} status={null} />
          {ensure.isError ? <Callout tone="bad">Couldn't start your submission. Try again.</Callout> : null}
        </View>
      ),
      footer: (
        <SaveBar label="Start working" onPress={() => ensure.mutate()} loading={ensure.isPending} />
      ),
    };
  }
  // A section of the page, so a card-sized skeleton, not the route's.
  if (query.isPending) return { body: <SkeletonCard />, footer: undefined };
  if (query.isError) {
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
    setInfo(null);
    save.mutate(submit ? { text: value, submit: true } : { text: value }, {
      onSuccess: () => setInfo(submit ? "Submitted!" : "Draft saved."),
      onSettled: () => setConfirming(false),
    });
  };

  const body = (
    <View className="gap-4">
      <DueBanner detail={detail} status={sub.status} />
      <View className="gap-2">
        <Eyebrow>Your submission</Eyebrow>
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
      {save.isError ? (
        <Callout tone="bad">
          {apiErrorMessage(save.error, "Couldn't save. Check your connection and try again.")}
        </Callout>
      ) : null}
      {info && !save.isPending ? <Callout tone="ok">{info}</Callout> : null}
      {sub.feedback ? (
        <View className="gap-2">
          <Eyebrow>Leader feedback</Eyebrow>
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
      hint={HINT}
      secondary={{
        label: save.isPending ? "Saving…" : "Save draft",
        onPress: () => run(false),
        disabled: save.isPending,
      }}
    />
  ) : undefined;
  return { body, footer };
}
