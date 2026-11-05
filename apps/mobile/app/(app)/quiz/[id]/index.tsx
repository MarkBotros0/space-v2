import { useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";

import { NAV_ICONS } from "../../../../src/design/icons/nav-icon";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { parsePositiveInt } from "../../../../src/lib/params";
import { StaffPreview } from "../../../../src/screens/quiz-detail/staff-quiz-preview";
import { StudentRunner } from "../../../../src/screens/quiz-detail/student-quiz-runner";
import { useSessionStore } from "../../../../src/store/session";

export default function QuizDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(rawId);
  const role = useSessionStore((s) => s.user?.role ?? null);

  if (id === null) {
    return (
      <Screen>
        <EmptyState icon={SearchX} title="Not found" description="That quiz doesn't exist." />
      </Screen>
    );
  }
  if (role === "STUDENT") return <StudentRunner id={id} />;
  if (role === "LEADER" || role === "ADMIN" || role === "SUPER") return <StaffPreview id={id} />;
  return (
    <Screen>
      <EmptyState
        icon={NAV_ICONS.quizzes}
        title="Quizzes"
        description="This screen isn't available for your role."
      />
    </Screen>
  );
}
