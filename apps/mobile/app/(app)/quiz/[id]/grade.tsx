import { type ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";

import { NAV_ICONS } from "../../../../src/design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { useQuizAuthoringDetail } from "../../../../src/hooks/use-quizzes";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useRole } from "../../../../src/store/session";
import { PaperGrid } from "../../../../src/screens/quiz-grade/paper-grid";
import { OnlineGrading } from "../../../../src/screens/quiz-grade/online-grading";

/**
 * v1 app/leader/sessions/[id]/quiz/[quizId] and the admin grade page — one
 * screen for every grader (B3-11): LEADER, ADMIN and SUPER.
 */
export default function QuizGradeScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(rawId);
  const role = useRole();
  const isStaff = role === "LEADER" || role === "ADMIN" || role === "SUPER";
  const detail = useQuizAuthoringDetail(id, isStaff);

  if (isStaff && id !== null && detail.data) {
    return detail.data.kind === "PAPER" ? (
      <PaperGrid id={id} detail={detail.data} />
    ) : (
      <OnlineGrading id={id} detail={detail.data} />
    );
  }

  let body: ReactNode;
  if (!isStaff)
    body = (
      <EmptyState icon={NAV_ICONS.quizzes} title="Quizzes" description="This screen isn't available for your role." />
    );
  else if (id === null) body = <EmptyState icon={SearchX} title="Not found" description="That quiz doesn't exist." />;
  else if (detail.isError) body = <RouteError onRetry={() => void detail.refetch()} />;
  else body = <RouteSkeleton />;
  return <Screen title="Quiz">{body}</Screen>;
}
