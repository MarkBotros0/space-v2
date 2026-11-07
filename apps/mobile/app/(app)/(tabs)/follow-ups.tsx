import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Flag } from "lucide-react-native";
import { View } from "react-native";
import type { FollowUp } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState, GroupedList, ListRow, PillButton, toast } from "../../../src/design/ui";
import { isDue, useFollowUps, useMarkFollowUpDone } from "../../../src/hooks/use-follow-ups";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { formatDate } from "../../../src/lib/format";
import { useSessionStore } from "../../../src/store/session";

/**
 * The mentor's follow-ups (owner, 2026-11-07): Due (7 days have passed), then
 * Waiting (due on a date), then Done in the last 30 days. Each row opens the
 * student; an open one has Done beside it. A follow-up is made from the
 * student's page, never here.
 */
export default function FollowUpsScreen() {
  const router = useRouter();
  const isMentor = useSessionStore((s) => s.user?.role === "MENTOR");
  const list = useFollowUps(isMentor);
  const done = useMarkFollowUpDone();

  const open = (f: FollowUp) =>
    router.push({ pathname: "/student/[id]", params: { id: String(f.studentUserId) } });
  const markDone = (f: FollowUp) =>
    done.mutate(
      { id: f.id },
      {
        onSuccess: () => toast.success(`Done with ${f.studentName}.`),
        onError: (err) => toast.error(apiErrorMessage(err, "Couldn't mark it done. Try again.")),
      },
    );

  const row = (f: FollowUp, when: string) => (
    <ListRow
      key={f.id}
      title={f.studentName}
      titleLines={2}
      subtitle={f.reason ? `${when} · ${f.reason}` : when}
      onPress={() => open(f)}
      trailing={
        f.doneAt === null ? (
          <PillButton
            label="Done"
            accessibilityLabel={`Mark ${f.studentName} done`}
            onPress={() => markDone(f)}
          />
        ) : undefined
      }
      trailingLabel={f.doneAt === null ? "Open" : "Done"}
    />
  );

  let body: ReactNode;
  if (!isMentor) {
    body = <EmptyState icon={Flag} title="Follow-ups" description="Follow-ups are for mentors." />;
  } else if (list.isPending) {
    body = <RouteSkeleton />;
  } else if (list.isError) {
    body = <RouteError onRetry={() => void list.refetch()} />;
  } else if (list.data.length === 0) {
    body = (
      <EmptyState
        icon={Flag}
        title="No follow-ups"
        description="Open a student and tap Follow up to come back to them in a week."
      />
    );
  } else {
    const now = new Date();
    const due = list.data.filter((f) => isDue(f, now));
    const waiting = list.data.filter((f) => f.doneAt === null && !isDue(f, now));
    const finished = list.data.filter((f) => f.doneAt !== null);
    body = (
      <View className="flex-col gap-6">
        {due.length > 0 ? (
          <GroupedList header={`Due (${due.length})`}>
            {due.map((f) => row(f, `Flagged ${formatDate(f.createdAt)}`))}
          </GroupedList>
        ) : null}
        {waiting.length > 0 ? (
          <GroupedList header={`Waiting (${waiting.length})`}>
            {waiting.map((f) => row(f, `Due ${formatDate(f.dueAt)}`))}
          </GroupedList>
        ) : null}
        {finished.length > 0 ? (
          <GroupedList header="Done recently">
            {finished.map((f) => row(f, `Done ${formatDate(f.doneAt)}`))}
          </GroupedList>
        ) : null}
      </View>
    );
  }

  const openCount = list.data?.filter((f) => f.doneAt === null).length ?? 0;
  return (
    <Screen
      title="Follow-ups"
      subtitle={list.data ? (openCount === 1 ? "1 open" : `${openCount} open`) : undefined}
      refreshing={list.isRefetching}
      onRefresh={() => {
        if (isMentor) void list.refetch();
      }}
    >
      {body}
    </Screen>
  );
}
