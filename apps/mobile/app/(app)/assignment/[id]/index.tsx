import { useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";

import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { useAssignmentDetail } from "../../../../src/hooks/use-assignments";
import { StaffAssignmentView } from "../../../../src/screens/assignment-detail/staff-assignment";
import { StudentAssignmentView } from "../../../../src/screens/assignment-detail/student-assignment";
import { useRole } from "../../../../src/store/session";

/**
 * One route for every role (D1): a student gets the checklist of parts and
 * Submit, staff get the parts and the students' progress. A notification for an
 * assignment with no essay links here for leaders too.
 */
export default function AssignmentDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const role = useRole();
  const query = useAssignmentDetail(id);

  if (id === null) {
    return (
      <Screen title="Assignment">
        <EmptyState icon={SearchX} title="Not found" description="That assignment link isn't valid." />
      </Screen>
    );
  }
  if (role === "STUDENT") return <StudentAssignmentView query={query} />;
  return <StaffAssignmentView query={query} />;
}
