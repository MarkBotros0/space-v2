import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { AssignmentStaffPanel } from "../../../../src/screens/assignment-detail/assignment-staff-panel";
import { ForumThread } from "../../../../src/screens/forum";
import { PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { Card as CardV1, EmptyState as EmptyStateV1, CardContent, RichTextView } from "../../../../src/design/ui";
import { useAssignmentDetail } from "../../../../src/hooks/use-assignments";
import { formatOrgDue } from "../../../../src/lib/format";
import { storedTextToHtml } from "../../../../src/lib/stored-text";
import { StudentAssignmentView } from "../../../../src/screens/assignment-detail/student-assignment";
import { useSessionStore } from "../../../../src/store/session";

export default function AssignmentDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  // D1: one route, the role picks the branch. Students get Plan 1's
  // submission editor; staff get the authoring panel and tracker.
  const isStudent = useSessionStore((s) => s.user?.role === "STUDENT");

  const query = useAssignmentDetail(id);
  const { data, isPending, isError, refetch, isRefetching } = query;

  if (isStudent && id !== null) return <StudentAssignmentView query={query} />;
  const forumPart = data?.parts.find((p) => p.kind === "FORUM");

  return (
    <ShellFrame onRefresh={() => void refetch()} refreshing={isRefetching}>
      {id === null ? (
        <EmptyStateV1 title="Not found" description="That assignment link isn't valid." />
      ) : isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <View className="flex-col gap-4">
          <PageTitle
            title={data.title}
            // The server's org-clock day and time (C2/X13), never dueAt in the device's zone.
            subtitle={`${data.dueOrgDay === null ? "No due date" : `Due ${formatOrgDue(data.dueOrgDay, data.dueOrgTime)}`}${
              data.isOverdue ? " · Overdue" : ""
            }`}
          />
          {/* Descriptions hold v1's stored HTML or v2 plain text; never show raw tags (B3-16). */}
          {data.description ? (
            <CardV1>
              <CardContent className="pt-6">
                <RichTextView html={storedTextToHtml(data.description)} />
              </CardContent>
            </CardV1>
          ) : null}
          {/* Staff keep the authoring panel and read the thread below it
              (own === null). MENTOR reads every group (the API answers 200,
              read-only), so it gets the thread too. */}
          <AssignmentStaffPanel detail={data} />
          {forumPart ? <ForumThread assignmentId={data.id} partId={forumPart.id} /> : null}
        </View>
      )}
    </ShellFrame>
  );
}
