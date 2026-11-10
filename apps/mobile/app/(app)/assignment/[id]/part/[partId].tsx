import { useLocalSearchParams } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../../src/design/layout/route-states";
import { Screen } from "../../../../../src/design/layout/screen";
import { EmptyState } from "../../../../../src/design/ui";
import { useAssignmentDetail } from "../../../../../src/hooks/use-assignments";
import { EssayPartScreen } from "../../../../../src/screens/assignment-detail/essay-part-screen";
import { ForumPartScreen } from "../../../../../src/screens/assignment-detail/forum-part-screen";
import { VideoPartScreen } from "../../../../../src/screens/assignment-detail/video-part-screen";

const positiveInt = (raw: string | undefined): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** One part of an assignment, opened from the student's checklist; the part's kind picks the screen. */
export default function AssignmentPartScreen() {
  const params = useLocalSearchParams<{ id: string; partId: string }>();
  const id = positiveInt(params.id);
  const partId = positiveInt(params.partId);
  const query = useAssignmentDetail(id);
  const refresh = () => query.refetch();

  // A failed pull keeps the part on screen: what is typed in it lives there.
  if (query.data === undefined) {
    return (
      <Screen title="Assignment">
        {id === null ? (
          <EmptyState title="Not found" description="That assignment link isn't valid." />
        ) : query.isPending ? (
          <RouteSkeleton />
        ) : (
          <RouteError onRetry={() => void query.refetch()} />
        )}
      </Screen>
    );
  }
  const detail = query.data;
  const part = detail.parts.find((p) => p.id === partId);
  switch (part?.kind) {
    case "VIDEO":
      return <VideoPartScreen detail={detail} part={part} />;
    case "ESSAY":
      return <EssayPartScreen detail={detail} part={part} refresh={refresh} />;
    case "FORUM":
      return <ForumPartScreen detail={detail} part={part} refresh={refresh} />;
    default:
      return (
        <Screen title={detail.title}>
          <EmptyState title="Not found" description="This part isn't in the assignment any more." />
        </Screen>
      );
  }
}
