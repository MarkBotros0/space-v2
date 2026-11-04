import { StudentList } from "../../../src/components/StudentList";

export default function DroppedScreen() {
  // No MENTOR: the endpoint refuses read-all access to drop reasons
  // (spec 06 §4.3), and the screen mirrors its gate.
  return <StudentList status="dropped" allowedRoles={["SUPER", "ADMIN"]} title="Dropped students" />;
}
