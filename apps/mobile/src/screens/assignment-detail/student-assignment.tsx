/** v1 app/student/assignments/[id]/page.tsx (STANDARD and FORUM branches), on the redesign's Screen. */
import type { UseQueryResult } from "@tanstack/react-query";
import { View } from "react-native";
import type { AssignmentDetail } from "@space/shared";

import { ForumThread } from "../../components/ForumThread";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { RichTextView, StatusChip, Text, dueChip, statusChip, type ChipSpec } from "../../design/ui";
import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useSubmissionDetail } from "../../hooks/use-submission";
import { deviceTodayKey } from "../../lib/calendar-grid";
import { formatOrgDue } from "../../lib/format";
import { storedTextToHtml } from "../../lib/stored-text";
import { useSubmissionEditor } from "./submission-editor";

/**
 * `isOverdue` only compares the due instant with now, whatever was handed in,
 * so it says nothing once work is in the leader's hands: the date stays, plainly.
 * RETURNED agrees with its Work row, where "Returned" stands in for "Overdue"; the
 * deadline still applies to it, and DueBanner says so.
 */
function dateChip(detail: AssignmentDetail, todayOrgDay: string): ChipSpec {
  const status = detail.mySubmission?.status;
  if (detail.dueOrgDay !== null && (status === "SUBMITTED" || status === "REVIEWED" || status === "RETURNED")) {
    return { tone: "neutral", label: `Due ${formatOrgDue(detail.dueOrgDay, null)}` };
  }
  return dueChip({ isOverdue: detail.isOverdue, dueOrgDay: detail.dueOrgDay, todayOrgDay });
}

function ChipRow({ detail, todayOrgDay }: { detail: AssignmentDetail; todayOrgDay: string }) {
  const forum = detail.type === "FORUM";
  const sub = detail.mySubmission;
  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap gap-1.5">
        {forum ? <StatusChip tone="info" label="Forum" /> : null}
        {/* The forum keeps v2's due chip (spec 14 D10) and shows none without a date. */}
        {!forum || detail.dueOrgDay !== null ? <StatusChip {...dateChip(detail, todayOrgDay)} /> : null}
        {sub ? <StatusChip {...statusChip("submission", sub.status)} /> : null}
        {sub?.isLate ? <StatusChip tone="warn" label="Late" /> : null}
      </View>
      {detail.dueOrgDay !== null ? (
        <Text variant="subhead" className="text-muted-foreground">
          {`Due ${formatOrgDue(detail.dueOrgDay, detail.dueOrgTime)}`}
        </Text>
      ) : null}
    </View>
  );
}

function StudentAssignment({
  detail,
  onRefresh,
  refreshing,
}: {
  detail: AssignmentDetail;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const forum = detail.type === "FORUM";
  const dash = useStudentDashboard(detail.seasonId);
  const { body, footer } = useSubmissionEditor(detail);
  // The chip comes from the assignment and the feedback from the submission: a pull
  // reads both, or the chip can say Returned over a body with no feedback in it.
  const publicId = detail.mySubmission?.publicId ?? null;
  const submission = useSubmissionDetail(publicId);
  const subtitle = [detail.seasonTitle, detail.sessionTitle].filter(Boolean).join(" · ");
  return (
    <Screen
      title={detail.title}
      subtitle={subtitle || undefined}
      onRefresh={() => {
        onRefresh();
        // `enabled` gates only the automatic run.
        if (publicId !== null) void submission.refetch();
      }}
      refreshing={refreshing || submission.isRefetching}
      footer={forum ? undefined : footer}
    >
      <View className="gap-4">
        <ChipRow detail={detail} todayOrgDay={dash.data?.todayOrgDay ?? deviceTodayKey()} />
        {detail.description ? (
          <View>
            <ListSectionHeader>{forum ? "Question" : "Brief"}</ListSectionHeader>
            <View className="rounded-group bg-surface p-4">
              <RichTextView html={storedTextToHtml(detail.description)} />
            </View>
          </View>
        ) : null}
        {/* A forum response IS the submission; it can never carry files. */}
        {forum ? <ForumThread assignmentId={detail.id} /> : body}
      </View>
    </Screen>
  );
}

/** The student's route body: loading and error states, then the detail. */
export function StudentAssignmentView({ query }: { query: UseQueryResult<AssignmentDetail> }) {
  // A failed pull keeps the screen: swapping it out would drop what is being typed.
  if (query.data === undefined) {
    return (
      <Screen title="Assignment">
        {query.isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void query.refetch()} />}
      </Screen>
    );
  }
  return (
    <StudentAssignment
      detail={query.data}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
    />
  );
}
