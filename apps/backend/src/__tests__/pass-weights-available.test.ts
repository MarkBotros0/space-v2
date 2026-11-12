/**
 * `checkWeightsAvailable`: a weight above 0 on a number the season has nothing for is refused
 * with 400 `weight_on_empty`; a 0 weight on it is fine.
 */
import { ApiError } from "../lib/api-error";
import { checkWeightsAvailable } from "../lib/passing/criteria";

const all = { attendance: true, assignments: true, quizzes: true };
const weights = { attendance: 40, assignments: 30, quizzes: 30 };

describe("checkWeightsAvailable", () => {
  it("accepts weights on numbers the season has", () => {
    expect(() => checkWeightsAvailable({ weights, passMark: 60 }, all)).not.toThrow();
    const noQuizzes = { ...all, quizzes: false };
    expect(() =>
      checkWeightsAvailable({ weights: { attendance: 50, assignments: 50, quizzes: 0 }, passMark: 60 }, noQuizzes),
    ).not.toThrow();
  });

  it("refuses a weight on a number with nothing to count, naming it", () => {
    let thrown: unknown;
    try {
      checkWeightsAvailable({ weights, passMark: 60 }, { ...all, assignments: false });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      code: "weight_on_empty",
      status: 400,
      message: "Assignments has nothing to count this season, so its weight must be 0.",
    });
  });
});
