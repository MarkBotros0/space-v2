import { planPollEdit, type CurrentPoll } from "../routes/announcements/poll-edit-plan";

/** A poll with options 1..n labelled as given, and the given (optionId, userId) votes. */
function current(
  allowsMultiple: boolean,
  labels: string[],
  votes: Array<[number, number]> = [],
): CurrentPoll {
  return {
    allowsMultiple,
    options: labels.map((label, i) => ({ id: i + 1, label })),
    votes: votes.map(([optionId, userId]) => ({ optionId, userId })),
  };
}

const same = (labels: string[]) => labels.map((label, i) => ({ id: i + 1, label }));

describe("planPollEdit", () => {
  it("leaves the poll alone when poll is absent", () => {
    const plan = planPollEdit(current(false, ["A", "B"], [[1, 10]]), undefined);
    expect(plan).toMatchObject({ kind: "none", lostVotes: 0, bumpVersion: false });
  });

  it("does nothing for null on a post without a poll", () => {
    expect(planPollEdit(null, null)).toMatchObject({ kind: "none", lostVotes: 0, bumpVersion: false });
  });

  it("creates a poll on a post without one, losing nothing and keeping version 1", () => {
    const plan = planPollEdit(null, { allowsMultiple: false, options: [{ label: "A" }, { label: "B" }] });
    expect(plan).toMatchObject({ kind: "create", lostVotes: 0, bumpVersion: false });
  });

  it("refuses an option id on a post without a poll", () => {
    const plan = planPollEdit(null, { allowsMultiple: false, options: [{ id: 3, label: "A" }, { label: "B" }] });
    expect(plan.kind).toBe("invalid");
  });

  it("renames only: no votes lost, version bumps, votes kept", () => {
    const plan = planPollEdit(current(false, ["Sat", "Sun"], [[1, 10], [2, 11]]), {
      allowsMultiple: false,
      options: [{ id: 1, label: "Saturday" }, { id: 2, label: "Sun" }],
    });
    expect(plan).toMatchObject({ kind: "update", lostVotes: 0, bumpVersion: true, removeOptionIds: [], clearUserIds: [] });
  });

  it("removing an option with 5 votes loses 5", () => {
    const votes: Array<[number, number]> = [[2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [1, 6]];
    const plan = planPollEdit(current(false, ["A", "B", "C"], votes), {
      allowsMultiple: false,
      options: [{ id: 1, label: "A" }, { id: 3, label: "C" }],
    });
    expect(plan).toMatchObject({ kind: "update", lostVotes: 5, bumpVersion: true, removeOptionIds: [2] });
  });

  it("several -> one with two multi-pickers holding 4 votes loses 4, keeping single picks", () => {
    const votes: Array<[number, number]> = [[1, 10], [2, 10], [2, 11], [3, 11], [1, 12], [3, 13]];
    const plan = planPollEdit(current(true, ["A", "B", "C"], votes), {
      allowsMultiple: false,
      options: same(["A", "B", "C"]),
    });
    expect(plan).toMatchObject({ kind: "update", lostVotes: 4, bumpVersion: true });
    if (plan.kind !== "update") throw new Error("expected update");
    expect([...plan.clearUserIds].sort()).toEqual([10, 11]);
  });

  it("several -> one with no multi-pickers loses nothing", () => {
    const plan = planPollEdit(current(true, ["A", "B"], [[1, 10], [2, 11]]), {
      allowsMultiple: false,
      options: same(["A", "B"]),
    });
    expect(plan).toMatchObject({ kind: "update", lostVotes: 0, bumpVersion: true, clearUserIds: [] });
  });

  it("does not count a vote twice when it is both on a removed option and a multi-pick", () => {
    const plan = planPollEdit(current(true, ["A", "B", "C"], [[1, 10], [2, 10], [3, 11]]), {
      allowsMultiple: false,
      options: [{ id: 1, label: "A" }, { id: 3, label: "C" }],
    });
    expect(plan.lostVotes).toBe(2);
  });

  it("identical input changes nothing", () => {
    const plan = planPollEdit(current(true, ["A", "B"], [[1, 10]]), { allowsMultiple: true, options: same(["A", "B"]) });
    expect(plan).toMatchObject({ lostVotes: 0, bumpVersion: false });
  });

  it("reordering bumps the version without losing votes", () => {
    const plan = planPollEdit(current(false, ["A", "B"], [[1, 10]]), {
      allowsMultiple: false,
      options: [{ id: 2, label: "B" }, { id: 1, label: "A" }],
    });
    expect(plan).toMatchObject({ kind: "update", lostVotes: 0, bumpVersion: true });
  });

  it("adding an option or allowing several bumps the version", () => {
    expect(
      planPollEdit(current(false, ["A", "B"]), { allowsMultiple: false, options: [...same(["A", "B"]), { label: "C" }] })
        .bumpVersion,
    ).toBe(true);
    expect(planPollEdit(current(false, ["A", "B"]), { allowsMultiple: true, options: same(["A", "B"]) }).bumpVersion).toBe(
      true,
    );
  });

  it("null with 9 votes removes the poll and loses 9", () => {
    const votes = Array.from({ length: 9 }, (_, i): [number, number] => [(i % 2) + 1, 100 + i]);
    expect(planPollEdit(current(false, ["A", "B"], votes), null)).toMatchObject({
      kind: "delete",
      lostVotes: 9,
      bumpVersion: false,
    });
  });

  it("refuses an option id that is not on this poll, or the same id twice", () => {
    expect(
      planPollEdit(current(false, ["A", "B"]), { allowsMultiple: false, options: [{ id: 1, label: "A" }, { id: 99, label: "B" }] })
        .kind,
    ).toBe("invalid");
    expect(
      planPollEdit(current(false, ["A", "B"]), { allowsMultiple: false, options: [{ id: 1, label: "A" }, { id: 1, label: "B" }] })
        .kind,
    ).toBe("invalid");
  });
});
