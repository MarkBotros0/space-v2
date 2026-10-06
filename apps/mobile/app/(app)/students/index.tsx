import { StudentList } from "../../../src/components/StudentList";

export default function StudentsScreen() {
  // LEADER is included: their nav has no /students tab, but the endpoint
  // narrows them to their groups' members, and the route stays reachable by
  // navigation (spec 06 §9's leader-roster decision, answered "yes, scoped").
  return (
    <StudentList
      status="active"
      allowedRoles={["SUPER", "ADMIN", "MENTOR", "LEADER"]}
      title="Students"
    />
  );
}
