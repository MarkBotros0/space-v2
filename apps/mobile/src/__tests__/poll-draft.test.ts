/** What an announcement edit sends about its poll (refactor FE-080). */
import { pollPatch, samePoll } from "../screens/announcements/poll/use-poll-draft";

const poll = (labels: string[], allowsMultiple = false, ids = labels.map((_, i) => i + 1)) => ({
  allowsMultiple,
  options: labels.map((label, i) => ({ id: ids[i], label })),
});

describe("pollPatch", () => {
  it("sends nothing for the poll as opened, or for no poll before and after", () => {
    expect(pollPatch(poll(["A", "B"]), poll(["A", "B"]))).toEqual({});
    expect(pollPatch(null, null)).toEqual({});
  });

  it("sends the poll once a label, the order, the option set or the multi-pick setting changed", () => {
    expect(pollPatch(poll(["A", "B"]), poll(["A", "C"]))).toEqual({ poll: poll(["A", "C"]) });
    expect(pollPatch(poll(["A", "B"]), poll(["B", "A"], false, [2, 1]))).toHaveProperty("poll");
    expect(pollPatch(poll(["A", "B"]), poll(["A", "B", "C"]))).toHaveProperty("poll");
    expect(pollPatch(poll(["A", "B"]), poll(["A", "B"], true))).toHaveProperty("poll");
  });

  it("sends a new option without an id as a change", () => {
    const opened = poll(["A", "B"]);
    const edited = { allowsMultiple: false, options: [{ id: 1, label: "A" }, { label: "B" }] };
    expect(samePoll(opened, edited)).toBe(false);
  });

  it("sends null once the poll is removed, and the poll when one is added", () => {
    expect(pollPatch(poll(["A", "B"]), null)).toEqual({ poll: null });
    expect(pollPatch(null, poll(["A", "B"]))).toEqual({ poll: poll(["A", "B"]) });
  });

  it("an edit put back as it was sends nothing", () => {
    expect(pollPatch(poll(["A", "B"]), poll(["A", "B"]))).toEqual({});
  });
});
