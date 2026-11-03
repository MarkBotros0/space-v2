import { useLocalSearchParams } from "expo-router";

import { parsePositiveInt } from "../../../../src/lib/params";
import { StaffPreview } from "../../../../src/screens/quiz-detail/staff-quiz-preview";
import { StudentRunner } from "../../../../src/screens/quiz-detail/student-quiz-runner";
import { useSessionStore } from "../../../../src/store/session";
import { EmptyState, Screen } from "../../../../src/ui";

export default function QuizDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(rawId);
  const role = useSessionStore((s) => s.user?.role ?? null);

  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That quiz doesn't exist." />
      </Screen>
    );
  }
  if (role === "STUDENT") return <StudentRunner id={id} />;
  if (role === "LEADER" || role === "ADMIN" || role === "SUPER") return <StaffPreview id={id} />;
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Quizzes" message="This screen isn't available for your role." />
    </Screen>
  );
}
