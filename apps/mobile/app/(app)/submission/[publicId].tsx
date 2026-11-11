import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SearchX } from "lucide-react-native";
import { View } from "react-native";
import { type SubmissionDetail } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { SaveBar } from "../../../src/design/layout/save-bar";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState } from "../../../src/design/ui";
import { useSubmissionDetail } from "../../../src/hooks/use-submission";
import { isNotFoundError } from "../../../src/lib/api-error";
import { FeedbackSheet, type Verdict } from "../../../src/screens/submission-review/feedback-sheet";
import {
  EssayChips,
  EssaySection,
  FeedbackSection,
  QuestionSection,
  ReturnedSection,
} from "../../../src/screens/submission-review/work-sections";

/** The loaded essay. Keyed by id by the caller, so the drafts typed in the sheet are this essay's. */
function EssayReview({
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
  const [verdict, setVerdict] = useState<Verdict>("reviewed");
  const [feedback, setFeedback] = useState(data.feedback ?? "");
  const [note, setNote] = useState("");
  const alreadyReviewed = data.status === "REVIEWED";
  // C4: the flag drives the UI; the server gate protects the write. A returned
  // essay is back with the student, and the server refuses a verdict on it.
  const canJudge = data.canReview && (data.status === "SUBMITTED" || alreadyReviewed);
  const openSheet = (next: Verdict) => {
    setVerdict(next);
    setOpen(true);
  };

  return (
    <Screen
      title={data.assignmentTitle}
      subtitle={data.studentName ?? data.studentEmail}
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        canJudge ? (
          <SaveBar
            label={alreadyReviewed ? "Update feedback" : "Mark reviewed"}
            onPress={() => openSheet("reviewed")}
            secondary={{ label: "Return", onPress: () => openSheet("return") }}
          />
        ) : undefined
      }
    >
      <View className="flex-col gap-4">
        <EssayChips data={data} />
        <QuestionSection prompt={data.prompt} />
        <EssaySection data={data} />
        {data.canReview && data.status === "RETURNED" ? (
          <ReturnedSection feedback={data.feedback} />
        ) : data.feedback ? (
          <FeedbackSection header={canJudge ? "Current feedback" : "Feedback"} feedback={data.feedback} />
        ) : null}
      </View>
      {canJudge ? (
        <FeedbackSheet
          open={open}
          verdict={verdict}
          onClose={() => setOpen(false)}
          publicId={data.publicId}
          alreadyReviewed={alreadyReviewed}
          text={verdict === "return" ? note : feedback}
          onText={verdict === "return" ? setNote : setFeedback}
          onReturned={() => router.back()}
        />
      ) : null}
    </Screen>
  );
}

/**
 * One essay of one student, for every staff reviewer (v1 app/leader/submissions/[publicId]).
 * `publicId` is the essay work's: the queue, the progress rows, the season-end
 * blockers and the leader's notification all carry that one.
 */
export default function SubmissionReviewScreen() {
  const { publicId: rawPublicId } = useLocalSearchParams<{ publicId: string }>();
  const publicId = typeof rawPublicId === "string" && rawPublicId.length > 0 ? rawPublicId : null;
  const { data, isPending, isError, error, refetch, isRefetching } = useSubmissionDetail(publicId);

  if (publicId === null || (isError && isNotFoundError(error))) {
    return (
      <Screen title="Essay">
        <EmptyState
          icon={SearchX}
          title="This essay isn't here"
          description="It may have been removed from the assignment, or the link is an old one."
        />
      </Screen>
    );
  }
  if (isPending || isError) {
    return (
      <Screen title="Essay">{isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}</Screen>
    );
  }
  return <EssayReview key={data.publicId} data={data} refreshing={isRefetching} onRefresh={() => void refetch()} />;
}
