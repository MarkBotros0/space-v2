import { AttendanceList } from "../../../../src/screens/past-season/record-lists";
import { RecordScreen } from "../../../../src/screens/past-season/record-screen";

export default function PastAttendanceScreen() {
  return <RecordScreen title="Attendance">{(record) => <AttendanceList record={record} />}</RecordScreen>;
}
