import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { File as FileIcon } from "lucide-react-native";
import { View } from "react-native";
import { plainTextToHtml, type AssignmentDetail, type MySubmissionSummary } from "@space/shared";

import { AssignmentStaffPanel } from "../../../../src/components/assignment-staff-panel";
import { ForumThread } from "../../../../src/components/ForumThread";
import { BackLink, Eyebrow, PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { cn } from "../../../../src/design/lib/cn";
import { iconWithClassName } from "../../../../src/design/lib/icon";
import { shadowStyle } from "../../../../src/design/lib/shadow";
import {
  Badge,
  Button as ButtonV1,
  Card as CardV1,
  CardContent,
  CardHeader,
  CardTitle,
  RichTextView,
  SkeletonCard,
  Text as TextV1,
  Textarea,
} from "../../../../src/design/ui";
import { useAssignmentDetail } from "../../../../src/hooks/use-assignments";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { storedTextToHtml } from "../../../../src/lib/stored-text";
import {
  useEnsureSubmission,
  useSaveSubmission,
  useSubmissionDetail,
} from "../../../../src/hooks/use-submission";
import { formatDayKey, formatDistanceOnly, formatOrgDue } from "../../../../src/lib/format";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

iconWithClassName(FileIcon);

const NOTICE = {
  error: "rounded-md bg-error-50 px-3 py-2 text-sm text-error-800 dark:bg-error-950 dark:text-error-200",
  success: "rounded-md bg-success-50 px-3 py-2 text-sm text-success-800 dark:bg-success-950 dark:text-success-200",
};

/** v1's hero due badge: overdue → "Due MMM d, yyyy" (org day), else "Due in …", or "No due date". */
function DueBadge({ detail }: { detail: AssignmentDetail }) {
  if (detail.dueOrgDay === null || detail.dueAt === null) return <Badge variant="outline">No due date</Badge>;
  if (detail.isOverdue) return <Badge variant="error">{`Due ${formatDayKey(detail.dueOrgDay)}`}</Badge>;
  return <Badge variant="warning">{`Due in ${formatDistanceOnly(detail.dueAt)}`}</Badge>;
}

/** v1 student-submission-form.tsx dueBanner; hidden once reviewed. */
function DueBanner({ detail, status }: { detail: AssignmentDetail; status: string | null }) {
  if (detail.dueAt === null || status === "REVIEWED") return null;
  if (detail.isOverdue) {
    return (
      <TextV1 className="rounded-md bg-error-50 px-3 py-2 text-sm text-error-800 dark:bg-error-950 dark:text-error-200">
        Past due — submitted work will be marked late.
      </TextV1>
    );
  }
  const urgent = Date.parse(detail.dueAt) - Date.now() < 86_400_000;
  return (
    <TextV1
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        urgent
          ? "bg-warning-50 text-warning-800 dark:bg-warning-950 dark:text-warning-200"
          : "bg-info-50 text-info-800 dark:bg-info-950 dark:text-info-200",
      )}
    >
      {`Due in ${formatDistanceOnly(detail.dueAt)}`}
    </TextV1>
  );
}

function StatusBadges({ status, isLate }: { status: string; isLate: boolean }) {
  if (status === "DRAFT") return null;
  return (
    <View className="flex-row gap-1.5">
      {status === "REVIEWED" ? (
        <Badge variant="success">Reviewed</Badge>
      ) : status === "RETURNED" ? (
        <Badge variant="warning">Returned</Badge>
      ) : (
        <Badge variant="info">Submitted</Badge>
      )}
      {isLate ? <Badge variant="warning">Late</Badge> : null}
    </View>
  );
}

function SubmissionSection({ detail }: { detail: AssignmentDetail }) {
  const sub = detail.mySubmission;
  const ensure = useEnsureSubmission(detail.id);

  if (sub === null) {
    // Nothing is created up front (ruling C6): the student starts explicitly.
    return (
      <View className="flex-col gap-4">
        <DueBanner detail={detail} status={null} />
        <CardV1>
          <CardHeader>
            <CardTitle className="text-base">Your submission</CardTitle>
          </CardHeader>
          <CardContent className="flex-col gap-4">
            <ButtonV1 className="self-start" disabled={ensure.isPending} onPress={() => ensure.mutate()}>
              Start working
            </ButtonV1>
            {ensure.isError ? <TextV1 className={NOTICE.error}>Couldn't start your submission. Try again.</TextV1> : null}
          </CardContent>
        </CardV1>
      </View>
    );
  }
  return <SubmissionEditor detail={detail} summary={sub} />;
}

function SubmissionEditor({ detail, summary }: { detail: AssignmentDetail; summary: MySubmissionSummary }) {
  const { data: sub, isPending, isError, refetch } = useSubmissionDetail(summary.publicId);
  const save = useSaveSubmission(summary.publicId, detail.id);
  const [text, setText] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // A section of the page, so a card-sized skeleton, not the route's.
  if (isPending) return <SkeletonCard />;
  if (isError) return <RouteError onRetry={() => void refetch()} />;

  // Local edits win once typing starts; before that, the server's text shows.
  const value = text ?? sub.text ?? "";
  // v2 keeps DRAFT/RETURNED as the editable states (B2-16).
  const editable = sub.status === "DRAFT" || sub.status === "RETURNED";
  // v1 student-submission-form.tsx:158 — and the server's 400 empty_submission rule.
  const nothingToSubmit = value.trim() === "" && sub.files.length === 0;
  const run = (submit: boolean) => {
    setInfo(null);
    save.mutate(submit ? { text: value, submit: true } : { text: value }, {
      onSuccess: () => setInfo(submit ? "Submitted!" : "Draft saved."),
    });
  };

  return (
    <View className="flex-col gap-4">
      <DueBanner detail={detail} status={sub.status} />
      <CardV1>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Your submission</CardTitle>
          <StatusBadges status={sub.status} isLate={sub.isLate} />
        </CardHeader>
        <CardContent className="flex-col gap-4">
          {/* Plain text in and out: the API returns submissions as plain text, so a
              rich editor would lose its formatting on reload (gap note). */}
          {editable ? (
            <Textarea
              accessibilityLabel="Your response"
              placeholder="Write your response…"
              value={value}
              onChangeText={setText}
              className="min-h-32"
            />
          ) : (
            <RichTextView html={value ? plainTextToHtml(value) : null} emptyText="No written response." />
          )}
          {detail.maxFileSizeMb !== null ? (
            <View className="flex-col gap-2">
              <TextV1 className="text-sm font-medium">{`Files (max ${detail.maxFileSizeMb} MB each)`}</TextV1>
              {sub.files.length > 0 ? (
                <View className="flex-col gap-1.5">
                  {sub.files.map((f) => (
                    <View
                      key={f.originalName}
                      className="flex-row items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                    >
                      <View className="min-w-0 flex-1 flex-row items-center gap-2">
                        <FileIcon size={16} className="shrink-0 text-muted-foreground" />
                        <TextV1 numberOfLines={1} className="shrink text-sm">
                          {f.originalName}
                        </TextV1>
                      </View>
                      <TextV1 className="shrink-0 text-xs text-muted-foreground">{`${(f.sizeBytes / 1024).toFixed(1)} KB`}</TextV1>
                    </View>
                  ))}
                </View>
              ) : null}
              {!sub.canUploadFiles ? (
                <TextV1 className="text-xs text-muted-foreground">
                  This assignment expects a file, but attachments aren't available in the app yet.
                </TextV1>
              ) : null}
            </View>
          ) : null}
          {save.isError ? (
            <TextV1 className={NOTICE.error}>{apiErrorMessage(save.error, "Couldn't save. Check your connection and try again.")}</TextV1>
          ) : null}
          {info && !save.isPending ? <TextV1 className={NOTICE.success}>{info}</TextV1> : null}
          {editable ? (
            <View className="flex-col-reverse gap-2">
              <ButtonV1 variant="outline" disabled={save.isPending} onPress={() => run(false)}>
                {save.isPending ? "Saving…" : "Save draft"}
              </ButtonV1>
              <ButtonV1 disabled={save.isPending || nothingToSubmit} onPress={() => run(true)}>
                Submit
              </ButtonV1>
            </View>
          ) : null}
        </CardContent>
      </CardV1>
      {sub.feedback ? (
        <CardV1>
          <CardHeader>
            <CardTitle className="text-base">Leader feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <RichTextView html={plainTextToHtml(sub.feedback)} />
          </CardContent>
        </CardV1>
      ) : null}
    </View>
  );
}

/** v1 app/student/assignments/[id]/page.tsx (STANDARD and FORUM branches). */
function StudentAssignmentDetail({ detail, onRefresh, refreshing }: { detail: AssignmentDetail; onRefresh: () => void; refreshing: boolean }) {
  const router = useRouter();
  const forum = detail.type === "FORUM";
  return (
    <ShellFrame onRefresh={onRefresh} refreshing={refreshing}>
      <View className="flex-col gap-3">
        <View>
          <BackLink label="Assignments" onPress={() => router.back()} />
          <View className="mt-2 rounded-2xl border border-border bg-card p-5" style={shadowStyle("soft")}>
            {forum ? (
              <View className="mb-2 flex-row items-center gap-2">
                <Badge variant="teal">Forum</Badge>
              </View>
            ) : null}
            <PageTitle title={detail.title} size="detail" />
            {/* The forum keeps v2's due badge (spec 14 D10); v1 showed none there. */}
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              {forum && detail.dueOrgDay !== null ? (
                <Badge variant={detail.isOverdue ? "error" : "warning"}>{`Due ${formatDayKey(detail.dueOrgDay)}`}</Badge>
              ) : forum ? null : (
                <DueBadge detail={detail} />
              )}
            </View>
          </View>
        </View>
        {detail.description ? (
          <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
            <Eyebrow className="mb-2">{forum ? "Question" : "Brief"}</Eyebrow>
            <RichTextView html={storedTextToHtml(detail.description)} />
          </View>
        ) : null}
        {/* A forum response IS the submission; it can never carry files. */}
        {forum ? <ForumThread assignmentId={detail.id} /> : <SubmissionSection detail={detail} />}
      </View>
    </ShellFrame>
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

  const { data, isPending, isError, refetch, isRefetching } = useAssignmentDetail(id);

  if (isStudent && id !== null) {
    if (isPending || isError) {
      return <ShellFrame>{isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}</ShellFrame>;
    }
    return <StudentAssignmentDetail detail={data} onRefresh={() => void refetch()} refreshing={isRefetching} />;
  }

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
          {/* Staff keep the authoring panel and read the thread below it
              (own === null). MENTOR reads every group (the API answers 200,
              read-only), so it gets the thread too. */}
          <AssignmentStaffPanel detail={data} />
          {data.type === "FORUM" ? <ForumThread assignmentId={data.id} /> : null}
        </>
      )}
    </Screen>
  );
}
