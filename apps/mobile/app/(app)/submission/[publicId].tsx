import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SearchX } from "lucide-react-native";
import { View } from "react-native";
import { type SubmissionDetail } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { SaveBar } from "../../../src/design/layout/save-bar";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState } from "../../../src/design/ui";
import { StatusChip, statusChip } from "../../../src/design/ui/status-chip";
import { useSubmissionDetail } from "../../../src/hooks/use-submission";
import { formatShortDateTime } from "../../../src/lib/format";
import { FeedbackSheet } from "../../../src/screens/submission-review/feedback-sheet";
import {
  FeedbackSection,
  PromptSection,
  ReturnedSection,
  WorkSection,
} from "../../../src/screens/submission-review/work-sections";

/** The loaded submission. Keyed by id by the caller, so the feedback draft is this submission's. */
function SubmissionReview({
  data,
  refreshing,
  onRefresh,
}: {
  data: SubmissionDetail;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(data.feedback ?? "");
  const alreadyReviewed = data.reviewedAt !== null;
  // C4: the flag drives the UI; the server gate is what protects the write.
  const canGive = data.canReview && data.status !== "RETURNED";
  const label = alreadyReviewed ? "Update feedback" : "Add feedback";

  return (
    <Screen
      title={data.assignmentTitle}
      subtitle={`${data.studentName ?? data.studentEmail}${data.groupName ? ` · ${data.groupName}` : ""}`}
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={canGive ? <SaveBar label={label} onPress={() => setOpen(true)} /> : undefined}
    >
      <View className="flex-col gap-4">
        <View className="flex-row flex-wrap gap-2">
          <StatusChip {...statusChip("submission", data.status)} />
          {data.isLate ? <StatusChip tone="warn" label="Late" /> : null}
          {data.submittedAt ? (
            <StatusChip tone="neutral" label={`Submitted ${formatShortDateTime(data.submittedAt)}`} />
          ) : null}
          {data.assignmentDueAt ? (
            <StatusChip tone="neutral" label={`Due ${formatShortDateTime(data.assignmentDueAt)}`} />
          ) : null}
        </View>
        <PromptSection description={data.assignmentDescription} />
        <WorkSection text={data.text} files={data.files} />
        {data.canReview && data.status === "RETURNED" ? (
          <ReturnedSection feedback={data.feedback} />
        ) : canGive ? (
          data.feedback ? <FeedbackSection header="Current feedback" feedback={data.feedback} /> : null
        ) : data.feedback ? (
          <FeedbackSection header="Feedback" feedback={data.feedback} />
        ) : null}
      </View>
      {canGive ? (
        <FeedbackSheet
          open={open}
          onClose={() => setOpen(false)}
          publicId={data.publicId}
          alreadyReviewed={alreadyReviewed}
          feedback={feedback}
          onFeedback={setFeedback}
          onReturned={() => router.back()}
        />
      ) : null}
    </Screen>
  );
}

/** v1 app/leader/submissions/[publicId]/page.tsx — one submission, for every staff reviewer. */
export default function SubmissionReviewScreen() {
  const { publicId: rawPublicId } = useLocalSearchParams<{ publicId: string }>();
  const publicId = typeof rawPublicId === "string" && rawPublicId.length > 0 ? rawPublicId : null;
  const { data, isPending, isError, refetch, isRefetching } = useSubmissionDetail(publicId);

  if (publicId === null) {
    return (
      <Screen title="Submission">
        <EmptyState icon={SearchX} title="Not found" description="That submission link isn't valid." />
      </Screen>
    );
  }
  if (isPending || isError) {
    return (
      <Screen title="Submission">
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </Screen>
    );
  }
  return (
    <SubmissionReview
      key={data.publicId}
      data={data}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    />
  );
}
