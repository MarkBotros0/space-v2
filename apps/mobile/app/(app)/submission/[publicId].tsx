import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { File as FileIcon, SearchX } from "lucide-react-native";
import { View } from "react-native";
import { plainTextToHtml } from "@space/shared";

import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { iconWithClassName } from "../../../src/design/lib/icon";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  RichTextView,
  SubmissionStatusBadge,
  Text,
  Textarea,
  toast,
} from "../../../src/design/ui";
import { useReviewSubmission, useSubmissionDetail } from "../../../src/hooks/use-submission";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { formatShortDateTime } from "../../../src/lib/format";
import { storedTextToHtml } from "../../../src/lib/stored-text";

iconWithClassName(FileIcon);

/**
 * v1 components/assignments/submission-review-form.tsx. Feedback travels as
 * plain text, so this is a plain Textarea (C11, B2-16). "Return for revision"
 * is v2's (spec 08 D11). Like v1, a verdict keeps the reviewer on the page:
 * the detail refetches and the title flips to "Update feedback" (B3-9).
 */
function ReviewForm({
  publicId,
  initialFeedback,
  alreadyReviewed,
}: {
  publicId: string;
  initialFeedback: string;
  alreadyReviewed: boolean;
}) {
  const review = useReviewSubmission(publicId);
  const [feedback, setFeedback] = useState(initialFeedback);

  const submit = (returnForRevision: boolean) =>
    review.mutate(
      { feedback, returnForRevision },
      { onSuccess: () => toast.success(returnForRevision ? "Returned for revision." : "Review saved.") },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{alreadyReviewed ? "Update feedback" : "Add feedback"}</CardTitle>
      </CardHeader>
      <CardContent className="flex-col gap-4">
        <Textarea
          accessibilityLabel="Feedback"
          placeholder="What did the student do well? What could be stronger?"
          value={feedback}
          onChangeText={setFeedback}
          className="min-h-32"
        />
        {review.isError ? (
          <Text className="rounded-md bg-error-50 px-3 py-2 text-sm text-error-800 dark:bg-error-950 dark:text-error-200">
            {apiErrorMessage(review.error, "Couldn't record the review. It may not have been submitted yet.")}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={review.isPending} onPress={() => submit(true)}>
            Return for revision
          </Button>
          <Button disabled={review.isPending} onPress={() => submit(false)}>
            {review.isPending ? "Saving…" : alreadyReviewed ? "Update review" : "Mark as reviewed"}
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}

/** v1 app/leader/submissions/[publicId]/page.tsx — one submission, for every staff reviewer. */
export default function SubmissionReviewScreen() {
  const { publicId: rawPublicId } = useLocalSearchParams<{ publicId: string }>();
  const publicId = typeof rawPublicId === "string" && rawPublicId.length > 0 ? rawPublicId : null;

  const { data, isPending, isError, refetch, isRefetching } = useSubmissionDetail(publicId);

  if (publicId === null) {
    return (
      <ShellFrame>
        <EmptyState icon={SearchX} title="Not found" description="That submission link isn't valid." />
      </ShellFrame>
    );
  }

  return (
    <ShellFrame refreshing={isRefetching} onRefresh={() => void refetch()}>
      {isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <View className="flex-col gap-4">
          <PageTitle
            title={data.assignmentTitle}
            subtitle={`${data.studentName ?? data.studentEmail}${data.groupName ? ` · ${data.groupName}` : ""}`}
          />
          {/* v1's mb-4 on top of the page's gap-4: 32px before the first card. */}
          <View className="mb-4 flex-row flex-wrap gap-2">
            <SubmissionStatusBadge status={data.status} />
            {data.isLate ? <Badge variant="warning">Late</Badge> : null}
            {data.submittedAt ? (
              <Badge variant="outline">{`Submitted ${formatShortDateTime(data.submittedAt)}`}</Badge>
            ) : null}
            {data.assignmentDueAt ? (
              <Badge variant="outline">{`Due ${formatShortDateTime(data.assignmentDueAt)}`}</Badge>
            ) : null}
          </View>

          {data.assignmentDescription ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-base">Assignment prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <RichTextView html={storedTextToHtml(data.assignmentDescription)} />
              </CardContent>
            </Card>
          ) : null}

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Submission</CardTitle>
            </CardHeader>
            <CardContent className="flex-col gap-4">
              <RichTextView html={data.text ? plainTextToHtml(data.text) : null} emptyText="No written response." />
              {data.files.length > 0 ? (
                <View className="flex-col gap-1.5">
                  <Text className="text-sm font-medium">Attachments</Text>
                  {data.files.map((f) => (
                    <View
                      key={f.id}
                      className="flex-row items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                    >
                      <View className="min-w-0 flex-1 flex-row items-center gap-2">
                        <FileIcon size={16} className="shrink-0 text-muted-foreground" />
                        <Text numberOfLines={1} className="shrink text-sm">
                          {f.originalName}
                        </Text>
                      </View>
                      <Text className="shrink-0 text-xs text-muted-foreground">{`${(f.sizeBytes / 1024).toFixed(1)} KB`}</Text>
                    </View>
                  ))}
                  <Text className="text-xs italic text-muted-foreground">Files can't be opened in the app yet.</Text>
                </View>
              ) : null}
            </CardContent>
          </Card>

          {/* C4: the flag drives the UI; the server gate is what protects the write. */}
          {data.canReview ? (
            <ReviewForm
              key={data.publicId}
              publicId={data.publicId}
              initialFeedback={data.feedback ?? ""}
              alreadyReviewed={data.reviewedAt !== null}
            />
          ) : data.feedback ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <RichTextView html={plainTextToHtml(data.feedback)} />
              </CardContent>
            </Card>
          ) : null}
        </View>
      )}
    </ShellFrame>
  );
}
