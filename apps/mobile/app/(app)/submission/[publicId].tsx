import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { SubmissionDetail } from "@space/shared";

import { useReviewSubmission, useSubmissionDetail } from "../../../src/hooks/use-submission";
import { useTheme } from "../../../src/theme";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  Text,
} from "../../../src/ui";

/** Same wording as Plan 1's submissionStatusLine, so student and reviewer read the same words. */
function statusLine(sub: SubmissionDetail): string {
  if (sub.status === "REVIEWED") return "Reviewed";
  // v1 parity 2026-10-09 (was "Returned for revision"): legacy rows only; v1 badge label.
  if (sub.status === "RETURNED") return "Returned";
  if (sub.status === "SUBMITTED") return sub.isLate ? "Submitted late" : "Submitted";
  return "Draft";
}

function Verdict({ publicId, initialFeedback, alreadyReviewed }: { publicId: string; initialFeedback: string; alreadyReviewed: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const review = useReviewSubmission(publicId);
  const [feedback, setFeedback] = useState(initialFeedback);

  const submit = () => review.mutate({ feedback }, { onSuccess: () => router.back() });

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">{alreadyReviewed ? "Update feedback" : "Add feedback"}</Text>
      <Input label="Feedback" value={feedback} onChangeText={setFeedback} multiline numberOfLines={6} />
      {review.isError ? (
        <Text variant="caption" color={theme.colors.error[700]}>
          Couldn't record the review. Check your connection and try again.
        </Text>
      ) : null}
      {/* v1 parity 2026-10-09 (R21): one action (v1 submission-actions.ts:167-191); no "Return for revision". */}
      <Button title={alreadyReviewed ? "Update review" : "Mark reviewed"} onPress={submit} loading={review.isPending} />
    </Card>
  );
}

export default function SubmissionReviewScreen() {
  const theme = useTheme();
  const { publicId: rawPublicId } = useLocalSearchParams<{ publicId: string }>();
  const publicId = typeof rawPublicId === "string" && rawPublicId.length > 0 ? rawPublicId : null;

  const { data, isPending, isError, refetch } = useSubmissionDetail(publicId);

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {publicId === null ? (
        <EmptyState title="Not found" message="That submission link isn't valid." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this submission." onRetry={refetch} />
      ) : (
        <>
          <Text variant="title">{data.assignmentTitle}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`${data.studentName ?? data.studentEmail}${data.groupName ? ` · ${data.groupName}` : ""}`}
          </Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {statusLine(data)}
          </Text>
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text variant="body">{data.text ?? "No text submitted."}</Text>
          </Card>
          {data.feedback ? (
            <Card style={{ marginTop: theme.spacing.md }}>
              <Text variant="heading">Feedback</Text>
              <Text variant="body">{data.feedback}</Text>
            </Card>
          ) : null}
          {/* C4: the flag drives the UI; the server gate is what protects the write. */}
          {data.canReview ? (
            <Verdict
              key={data.publicId}
              publicId={data.publicId}
              initialFeedback={data.feedback ?? ""}
              alreadyReviewed={data.reviewedAt !== null}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
