import { StudentList } from "../../../src/components/StudentList";
import { BACK_TO_PREVIOUS } from "../../../src/design/layout/large-title";

export default function DroppedScreen() {
  // No MENTOR: the endpoint refuses read-all access to drop reasons
  // (spec 06 §4.3), and the screen mirrors its gate.
  return <StudentList status="dropped" allowedRoles={["SUPER", "ADMIN"]} title="Dropped students" back={BACK_TO_PREVIOUS} />;
}
