import { AssignmentsList } from "../../../../src/screens/past-season/record-lists";
import { RecordScreen } from "../../../../src/screens/past-season/record-screen";

export default function PastAssignmentsScreen() {
  return <RecordScreen title="Assignments">{(record) => <AssignmentsList record={record} />}</RecordScreen>;
}
