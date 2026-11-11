import { newShuffleSeed, randomOrder, seededOrder } from "../lib/quizzes/shuffle";

const items = [1, 2, 3, 4, 5, 6].map((id) => ({ id }));
const ids = (xs: { id: number }[]) => xs.map((x) => x.id);

describe("seededOrder", () => {
  it("same seed and salt give the same order", () => {
    expect(ids(seededOrder(items, 42, 7))).toEqual(ids(seededOrder(items, 42, 7)));
  });

  it("input order doesn't matter", () => {
    const reversed = [...items].reverse();
    expect(ids(seededOrder(reversed, 42, 7))).toEqual(ids(seededOrder(items, 42, 7)));
  });

  it("different salt gives a different order for 6 items", () => {
    expect(ids(seededOrder(items, 42, 1))).not.toEqual(ids(seededOrder(items, 42, 2)));
  });

  it("does not mutate", () => {
    const copy = [...items].reverse();
    const before = ids(copy);
    seededOrder(copy, 5, 5);
    expect(ids(copy)).toEqual(before);
  });

  it("seed 0 still returns a permutation", () => {
    expect(ids(seededOrder(items, 0, 0)).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("newShuffleSeed is in [1, 2^31 - 1]", () => {
    for (let i = 0; i < 50; i++) {
      const s = newShuffleSeed();
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(2 ** 31 - 1);
    }
  });
});

describe("randomOrder", () => {
  it("returns a permutation and does not mutate", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = randomOrder(input);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("does not keep the input order every time", () => {
    const input = Array.from({ length: 12 }, (_, i) => i);
    const kept = Array.from({ length: 20 }, () => randomOrder(input)).every((o) =>
      o.every((v: number, i: number) => v === i),
    );
    expect(kept).toBe(false);
  });
});
