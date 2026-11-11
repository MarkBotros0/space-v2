import type { PartWork } from "../../../../packages/shared/src/index";

import { standingOf } from "../lib/queries/assignments/part-work";

const video: PartWork = {
  partId: 1,
  kind: "VIDEO",
  status: "DONE",
  video: { watchedSeconds: 100, durationSeconds: 100, answered: 0, questionCount: 0, correct: 0 },
};
const forum: PartWork = { partId: 3, kind: "FORUM", status: "DONE", forum: { posted: true } };
const returnedEssay: PartWork = {
  partId: 2,
  kind: "ESSAY",
  status: "RETURNED",
  essay: { publicId: "essay00001", wordCount: 10, reviewStatus: "RETURNED", feedback: "More" },
};

describe("standingOf", () => {
  it("counts done parts and says whether an essay waits for review", () => {
    expect(standingOf([video, forum])).toEqual({ partsTotal: 2, partsDone: 2, returned: false, hasEssay: false });
    expect(standingOf([video, returnedEssay, forum])).toEqual({
      partsTotal: 3,
      partsDone: 2,
      returned: true,
      hasEssay: true,
    });
  });
});
