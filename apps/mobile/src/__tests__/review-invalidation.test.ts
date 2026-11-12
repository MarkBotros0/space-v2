jest.mock("../lib/api-client", () => ({ apiClient: { post: jest.fn() } }));

import { reviewInvalidations } from "../hooks/use-submission";
import { queryKeys } from "../lib/query-keys";

describe("reviewInvalidations", () => {
  it("refreshes the student's and the assignment's screens, not only the queue", () => {
    const keys = reviewInvalidations("pub1", { studentUserId: 9, assignmentId: 41 });
    expect(keys).toEqual(
      expect.arrayContaining([
        queryKeys.submissions.detail("pub1"),
        queryKeys.submissions.queues(),
        queryKeys.students.submissions(9),
        queryKeys.engagement.student(9),
        queryKeys.assignments.detail(41),
        queryKeys.assignments.progress(41),
        queryKeys.passing.all,
      ]),
    );
  });

  it("covers the student's own engagement read, keyed under the same prefix", () => {
    const keys = reviewInvalidations("pub1", { studentUserId: 9, assignmentId: 41 });
    const self = [...queryKeys.engagement.student(9), "self"];
    const prefix = queryKeys.engagement.student(9);
    expect(keys).toContainEqual(prefix);
    expect(self.slice(0, prefix.length)).toEqual([...prefix]);
  });

  it("falls back to whole subtrees when the detail is not cached", () => {
    const keys = reviewInvalidations("pub1", undefined);
    expect(keys).toEqual(
      expect.arrayContaining([
        queryKeys.students.details(),
        queryKeys.engagement.all,
        queryKeys.assignments.details(),
        queryKeys.assignments.progresses(),
      ]),
    );
  });
});
