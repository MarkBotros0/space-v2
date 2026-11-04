import { StudentList } from "../../../src/components/StudentList";
import { BACK_TO_PREVIOUS } from "../../../src/design/layout/large-title";

export default function AlumniScreen() {
  return <StudentList status="alumni" allowedRoles={["SUPER", "ADMIN", "MENTOR"]} title="Alumni" back={BACK_TO_PREVIOUS} />;
}
