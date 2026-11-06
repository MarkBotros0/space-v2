import { QuizzesList } from "../../../../src/screens/past-season/record-lists";
import { RecordScreen } from "../../../../src/screens/past-season/record-screen";

export default function PastQuizzesScreen() {
  return <RecordScreen title="Quizzes">{(record) => <QuizzesList record={record} />}</RecordScreen>;
}
