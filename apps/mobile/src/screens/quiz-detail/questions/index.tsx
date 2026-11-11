import { View } from "react-native";
import type { QuizQuestionStudent } from "@space/shared";

import { ContentText } from "../../../design/ui";
import type { DraftAnswer } from "../answer-model";
import { Essay } from "./essay";
import { FillBlank } from "./fill-blank";
import { Matching } from "./matching";
import { MultiChoice } from "./multi-choice";
import { SingleChoice } from "./single-choice";
import { TrueFalse } from "./true-false";

const TYPE_LABEL: Record<QuizQuestionStudent["type"], string> = {
  SINGLE_CHOICE: "Single choice",
  MULTI_CHOICE: "Multiple choice",
  TRUE_FALSE: "True or false",
  MATCHING: "Matching",
  FILL_BLANK: "Fill in the blank",
  ESSAY: "Essay",
};

/** The type's name for the question card's badge. */
export function questionTypeLabel(q: QuizQuestionStudent): string {
  return TYPE_LABEL[q.type];
}

type Props = {
  question: QuizQuestionStudent;
  /** The question's place in the quiz, from 0. */
  index: number;
  answer: DraftAnswer | undefined;
  onChange: (next: DraftAnswer) => void;
  disabled?: boolean;
};

/** The control for one question's type, under its prompt (a blank sentence is its own prompt). */
function Control({ question: q, index, answer, onChange, disabled }: Props) {
  // The draft starts as the question's own `answer` and only these controls change it, so its shape
  // is the question's; a missing one (never set) falls back to what the server sent.
  const a = answer ?? q.answer;
  const shared = { index, disabled };
  switch (q.type) {
    case "MULTI_CHOICE":
      return <MultiChoice {...shared} question={q} answer={a as typeof q.answer} onChange={onChange} />;
    case "MATCHING":
      return <Matching {...shared} question={q} answer={a as typeof q.answer} onChange={onChange} />;
    case "FILL_BLANK":
      return <FillBlank {...shared} question={q} answer={a as typeof q.answer} onChange={onChange} />;
    case "ESSAY":
      return <Essay {...shared} question={q} answer={a as typeof q.answer} onChange={onChange} />;
    case "TRUE_FALSE":
      return <TrueFalse {...shared} question={q} answer={a as typeof q.answer} onChange={onChange} />;
    default:
      return <SingleChoice {...shared} question={q} answer={a as typeof q.answer} onChange={onChange} />;
  }
}

/** A question's prompt and the input for its type. */
export function QuestionInput(props: Props) {
  return (
    <View className="mt-2 flex-col gap-3">
      {props.question.type === "FILL_BLANK" ? null : (
        <ContentText variant="headline">{props.question.prompt}</ContentText>
      )}
      <Control {...props} />
    </View>
  );
}
