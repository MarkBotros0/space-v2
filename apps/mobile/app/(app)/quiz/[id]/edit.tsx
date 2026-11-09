import { useLocalSearchParams } from "expo-router";

import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { EmptyState } from "../../../../src/design/ui";
import { QuizBuilder } from "../../../../src/screens/quiz-edit/quiz-builder";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useRole } from "../../../../src/store/session";

export default function QuizEditScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const role = useRole();

  // v1's builder route was requireRole(["ADMIN","SUPER"]) + canManageQuiz; the
  // role check here avoids a pointless fetch, and canManage (server-derived,
  // C4) is checked in QuizBuilder. The server enforces both on every write.
  if (role !== "ADMIN" && role !== "SUPER") {
    return (
      <ShellFrame>
        <EmptyState title="Not available" description="Only a season admin can edit quizzes." />
      </ShellFrame>
    );
  }
  if (id === null) {
    return (
      <ShellFrame>
        <EmptyState title="Not found" description="That quiz doesn't exist." />
      </ShellFrame>
    );
  }
  return <QuizBuilder id={id} />;
}
