import { SingleChoice } from "./single-choice";
import type { QuestionProps } from "./props";

/** True or False, always in that order (the server never shuffles them), as a tick and a cross. */
export function TrueFalse(props: QuestionProps<"SINGLE_CHOICE" | "TRUE_FALSE">) {
  return <SingleChoice {...props} trueFalse />;
}
