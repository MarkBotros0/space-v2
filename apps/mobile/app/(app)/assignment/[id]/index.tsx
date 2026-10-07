import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { AssignmentDetail, MySubmissionSummary } from "@space/shared";

import { AssignmentStaffPanel } from "../../../../src/components/assignment-staff-panel";
import { ForumThread } from "../../../../src/components/ForumThread";
import { useAssignmentDetail } from "../../../../src/hooks/use-assignments";
import {
  useEnsureSubmission,
  useSaveSubmission,
  useSubmissionDetail,
} from "../../../../src/hooks/use-submission";
import { formatOrgDue } from "../../../../src/lib/format";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  Text,
} from "../../../../src/ui";

function submissionStatusLine(sub: MySubmissionSummary): string {
  if (sub.status === "REVIEWED") return "Reviewed";
  if (sub.status === "RETURNED") return "Returned for revision";
  if (sub.status === "SUBMITTED") return sub.isLate ? "Submitted late" : "Submitted";
  return "Draft";
}

function SubmissionSection({ detail }: { detail: AssignmentDetail }) {
  const theme = useTheme();
  const sub = detail.mySubmission;
  const ensure = useEnsureSubmission(detail.id);

  if (sub === null) {
    return (
      <Card style={{ marginTop: theme.spacing.md }}>
        <Text variant="heading">Your submission</Text>
        <Button title="Start working" onPress={() => ensure.mutate()} loading={ensure.isPending} />
        {ensure.isError ? (
          <Text variant="caption" color={theme.colors.error[700]}>
            Couldn't start your submission. Try again.
          </Text>
        ) : null}
      </Card>
    );
  }
  return <SubmissionEditor detail={detail} summary={sub} />;
}

function SubmissionEditor({ detail, summary }: { detail: AssignmentDetail; summary: MySubmissionSummary }) {
  const theme = useTheme();
  const { data: sub, isPending, isError, refetch } = useSubmissionDetail(summary.publicId);
  const save = useSaveSubmission(summary.publicId, detail.id);
  const [text, setText] = useState<string | null>(null);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState message="Couldn't load your submission." onRetry={refetch} />;

  // Local edits win once typing starts; before that, the server's text shows.
  const value = text ?? sub.text ?? "";
  const editable = sub.status === "DRAFT" || sub.status === "RETURNED";

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Your submission</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {submissionStatusLine({ ...summary, status: sub.status, isLate: sub.isLate })}
      </Text>
      {sub.feedback ? <Text variant="body">{sub.feedback}</Text> : null}
      {editable ? (
        <>
          <Input label="Your answer" value={value} onChangeText={setText} multiline numberOfLines={8} />
          {detail.maxFileSizeMb !== null && !sub.canUploadFiles ? (
            <Text variant="caption" color={theme.colors.neutral[600]}>
              This assignment expects a file, but attachments aren't available in the app yet.
            </Text>
          ) : null}
          {save.isError ? (
            <Text variant="caption" color={theme.colors.error[700]}>
              Couldn't save. Check your connection and try again.
            </Text>
          ) : null}
          <Button
            title="Save draft"
            variant="secondary"
            onPress={() => save.mutate({ text: value })}
            loading={save.isPending}
          />
          <Button
            title="Submit"
            onPress={() => save.mutate({ text: value, submit: true })}
            loading={save.isPending}
          />
        </>
      ) : null}
    </Card>
  );
}

export default function AssignmentDetailScreen() {
  const theme = useTheme();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  // D1: one route, the role picks the branch. Students get Plan 1's
  // submission editor; staff get the authoring panel and tracker.
  const isStudent = useSessionStore((s) => s.user?.role === "STUDENT");

  const { data, isPending, isError, refetch } = useAssignmentDetail(id);

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {id === null ? (
        <EmptyState title="Not found" message="That assignment link isn't valid." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this assignment." onRetry={refetch} />
      ) : (
        <>
          <Text variant="title">{data.title}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {/* The server's org-clock day and time (C2/X13), never dueAt in the device's zone. */}
            {`${data.dueOrgDay === null ? "No due date" : `Due ${formatOrgDue(data.dueOrgDay, data.dueOrgTime)}`}${
              data.isOverdue ? " · Overdue" : ""
            }`}
          </Text>
          {data.description ? (
            <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
              {data.description}
            </Text>
          ) : null}
          {/* The FORUM branch replaces the student's submission editor entirely —
              a forum assignment can never carry file attachments, and its
              response IS the submission. Staff keep the authoring panel and
              read the thread below it (own === null). MENTOR reads every group
              (the API answers 200, read-only), so it gets the thread too. */}
          {isStudent ? (
            data.type === "FORUM" ? (
              <ForumThread assignmentId={data.id} />
            ) : (
              <SubmissionSection detail={data} />
            )
          ) : (
            <>
              <AssignmentStaffPanel detail={data} />
              {data.type === "FORUM" ? <ForumThread assignmentId={data.id} /> : null}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
