import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { AssignmentDetail, MySubmissionSummary, SubmissionDetail } from "@space/shared";

import { AssignmentStaffPanel } from "../../../../src/components/assignment-staff-panel";
import { ForumThread } from "../../../../src/components/ForumThread";
import { useAssignmentDetail } from "../../../../src/hooks/use-assignments";
import { useSaveSubmission, useSubmissionDetail } from "../../../../src/hooks/use-submission";
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

function submissionStatusLine(sub: { status: MySubmissionSummary["status"]; isLate: boolean }): string {
  if (sub.status === "REVIEWED") return "Reviewed";
  // v1 parity 2026-10-09 (was "Returned for revision"): nothing sets RETURNED any
  // more (v1 submission-actions.ts:178-191); legacy rows read v1's badge label
  // (submission-status-badge.tsx:23).
  if (sub.status === "RETURNED") return "Returned";
  if (sub.status === "SUBMITTED") return sub.isLate ? "Submitted late" : "Submitted";
  return "Draft";
}

/**
 * v1 parity 2026-10-09 (08-submissions R1): no "Start working" step — v1 shows
 * the editor at once (student/assignments/[id]/page.tsx:40). With no submission
 * yet the editor starts empty and the first Save draft / Submit creates it.
 */
function SubmissionSection({ detail }: { detail: AssignmentDetail }) {
  const summary = detail.mySubmission;
  if (summary === null) return <SubmissionEditor detail={detail} summary={null} />;
  return <LoadedSubmissionEditor detail={detail} summary={summary} />;
}

function LoadedSubmissionEditor({ detail, summary }: { detail: AssignmentDetail; summary: MySubmissionSummary }) {
  const { data: sub, isPending, isError, refetch } = useSubmissionDetail(summary.publicId);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState message="Couldn't load your submission." onRetry={refetch} />;
  return <SubmissionEditor detail={detail} summary={summary} sub={sub} />;
}

function SubmissionEditor({
  detail,
  summary,
  sub,
}: {
  detail: AssignmentDetail;
  summary: MySubmissionSummary | null;
  sub?: SubmissionDetail;
}) {
  const theme = useTheme();
  const save = useSaveSubmission(detail.id);
  const [text, setText] = useState<string | null>(null);

  // Local edits win once typing starts; before that, the server's text shows.
  const value = text ?? sub?.text ?? "";
  // v1 parity 2026-10-09 (08-submissions R14; was "DRAFT || RETURNED only"):
  // v1 student-submission-form.tsx:96 — read-only only when REVIEWED, or
  // SUBMITTED and past due (server isOverdue, C4). SUBMITTED work before the
  // due date stays editable and re-submittable.
  const status = sub?.status ?? null;
  const editable = !(status === "REVIEWED" || (status === "SUBMITTED" && detail.isOverdue));
  // v1 student-submission-form.tsx:158 — and the server's 400 empty_submission rule.
  const nothingToSubmit = value.trim() === "" && (sub?.files.length ?? 0) === 0;
  const publicId = summary?.publicId ?? null;

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Your submission</Text>
      {sub ? (
        <Text variant="label" color={theme.colors.neutral[600]}>
          {submissionStatusLine({ status: sub.status, isLate: sub.isLate })}
        </Text>
      ) : null}
      {sub?.feedback ? <Text variant="body">{sub.feedback}</Text> : null}
      {editable ? (
        <>
          <Input label="Your answer" value={value} onChangeText={setText} multiline numberOfLines={8} />
          {detail.maxFileSizeMb !== null && !(sub?.canUploadFiles ?? false) ? (
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
            onPress={() => save.mutate({ publicId, text: value })}
            loading={save.isPending}
          />
          <Button
            title="Submit"
            onPress={() => save.mutate({ publicId, text: value, submit: true })}
            loading={save.isPending}
            disabled={nothingToSubmit}
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
