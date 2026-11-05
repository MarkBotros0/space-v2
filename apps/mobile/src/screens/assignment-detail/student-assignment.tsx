/** v1 app/student/assignments/[id]/page.tsx (STANDARD and FORUM branches), on the redesign's Screen. */
import type { UseQueryResult } from "@tanstack/react-query";
import { View } from "react-native";
import type { AssignmentDetail } from "@space/shared";

import { ForumThread } from "../../components/ForumThread";
import { Eyebrow } from "../../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { RichTextView, StatusChip, dueChip, statusChip } from "../../design/ui";
import { useStudentDashboard } from "../../hooks/use-dashboard";
import { deviceTodayKey } from "../../lib/calendar-grid";
import { storedTextToHtml } from "../../lib/stored-text";
import { useSubmissionEditor } from "./submission-editor";

function ChipRow({ detail, todayOrgDay }: { detail: AssignmentDetail; todayOrgDay: string }) {
  const forum = detail.type === "FORUM";
  const sub = detail.mySubmission;
  const due = dueChip({ isOverdue: detail.isOverdue, dueOrgDay: detail.dueOrgDay, todayOrgDay });
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {forum ? <StatusChip tone="info" label="Forum" /> : null}
      {/* The forum keeps v2's due chip (spec 14 D10) and shows none without a date. */}
      {!forum || detail.dueOrgDay !== null ? <StatusChip {...due} /> : null}
      {sub ? <StatusChip {...statusChip("submission", sub.status)} /> : null}
      {sub?.isLate ? <StatusChip tone="warn" label="Late" /> : null}
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
  const subtitle = [detail.seasonTitle, detail.sessionTitle].filter(Boolean).join(" · ");
  return (
    <Screen
      title={detail.title}
      subtitle={subtitle || undefined}
      onRefresh={onRefresh}
      refreshing={refreshing}
      footer={forum ? undefined : footer}
    >
      <View className="gap-4">
        <ChipRow detail={detail} todayOrgDay={dash.data?.todayOrgDay ?? deviceTodayKey()} />
        {detail.description ? (
          <View className="gap-2">
            <Eyebrow>{forum ? "Question" : "Brief"}</Eyebrow>
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
  if (query.isPending || query.isError) {
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
