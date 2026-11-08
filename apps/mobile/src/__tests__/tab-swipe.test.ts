import { SWIPE_DISTANCE, SWIPE_VELOCITY, swipeStep } from "../../app/(app)/(tabs)/_layout";

// Owner 2026-11-08: swipe left or right to change tab, as Instagram does.
describe("swipeStep", () => {
  it("a long swipe left is the next tab, right the previous", () => {
    expect(swipeStep(-SWIPE_DISTANCE, 0)).toBe(1);
    expect(swipeStep(SWIPE_DISTANCE, 0)).toBe(-1);
  });

  it("a short, slow drag changes nothing", () => {
    expect(swipeStep(-(SWIPE_DISTANCE - 1), 0)).toBeNull();
  });

  it("a quick flick counts from half the distance", () => {
    expect(swipeStep(-SWIPE_DISTANCE / 2, -SWIPE_VELOCITY)).toBe(1);
    expect(swipeStep(-(SWIPE_DISTANCE / 2 - 1), -SWIPE_VELOCITY)).toBeNull();
  });
});
