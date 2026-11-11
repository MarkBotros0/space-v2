import { useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";

import { NAV_ICONS } from "../../../../src/design/icons/nav-icon";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { parsePositiveInt } from "../../../../src/lib/params";
import { LiveScreen } from "../../../../src/screens/quiz-live/live-screen";
import { useRole } from "../../../../src/store/session";

/** Staff only (leader, admin, super; the server's canGradeQuiz decides the rest): the quiz's live screen. */
export default function QuizLiveRoute() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(rawId);
  const role = useRole();
  const isStaff = role === "LEADER" || role === "ADMIN" || role === "SUPER";

  if (!isStaff) {
    return (
      <Screen title="Live">
        <EmptyState icon={NAV_ICONS.quizzes} title="Quizzes" description="This screen isn't available for your role." />
      </Screen>
    );
  }
  if (id === null) {
    return (
      <Screen title="Live">
        <EmptyState icon={SearchX} title="Not found" description="That quiz doesn't exist." />
      </Screen>
    );
  }
  return <LiveScreen id={id} />;
}
