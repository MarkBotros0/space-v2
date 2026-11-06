import { RecordScreen } from "../../../../src/screens/past-season/record-screen";
import { SeasonOverview } from "../../../../src/screens/past-season/season-overview";

/** /past-season/[seasonId] — one finished season, read-only (the student's own record). */
export default function PastSeasonScreen() {
  return <RecordScreen>{(record) => <SeasonOverview record={record} />}</RecordScreen>;
}
