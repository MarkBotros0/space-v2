import { useLocalSearchParams } from "expo-router";
import type { AssignmentDetail, MySubmissionSummary } from "@space/shared";

import { useAssignmentDetail } from "../../../src/hooks/use-assignments";
import { formatDueDate } from "../../../src/lib/format";
import { useTheme } from "../../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../src/ui";

function submissionStatusLine(sub: MySubmissionSummary): string {
  if (sub.status === "REVIEWED") return "Reviewed";
  if (sub.status === "RETURNED") return "Returned for revision";
  if (sub.status === "SUBMITTED") return sub.isLate ? "Submitted late" : "Submitted";
  return "Draft";
}

/**
 * The student's submission block. Task 4 replaces the read-only body with the
 * editor; the status/feedback rendering here stays as its top half.
 */
function SubmissionSection({ detail }: { detail: AssignmentDetail }) {
  const theme = useTheme();
  const sub = detail.mySubmission;

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Your submission</Text>
      {sub === null ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          Not started yet.
        </Text>
      ) : (
        <>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {submissionStatusLine(sub)}
          </Text>
          {sub.feedback ? <Text variant="body">{sub.feedback}</Text> : null}
        </>
      )}
    </Card>
  );
}

export default function AssignmentDetailScreen() {
  const theme = useTheme();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

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
            {`Due ${formatDueDate(data.dueAt)}${data.isOverdue ? " · Overdue" : ""}`}
          </Text>
          {data.description ? (
            <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
              {data.description}
            </Text>
          ) : null}
          <SubmissionSection detail={data} />
        </>
      )}
    </Screen>
  );
}
