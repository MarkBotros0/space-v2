import { StudentList } from "../../../src/components/StudentList";

export default function AlumniScreen() {
  return <StudentList status="alumni" allowedRoles={["SUPER", "ADMIN", "MENTOR"]} title="Alumni" />;
}
