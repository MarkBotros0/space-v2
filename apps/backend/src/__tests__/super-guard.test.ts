import { isLastActiveSuper } from "../lib/super-guard";

describe("isLastActiveSuper", () => {
  it("is true only when the target is the sole active SUPER", () => {
    expect(isLastActiveSuper([7], 7)).toBe(true);
  });

  it("is false when another active SUPER remains", () => {
    expect(isLastActiveSuper([7, 9], 7)).toBe(false);
  });

  it("is false when the target is not an active SUPER at all", () => {
    // Demoting a non-SUPER (or one already deactivated) can never remove the
    // last SUPER, whatever the count.
    expect(isLastActiveSuper([9], 7)).toBe(false);
  });

  it("treats an empty set as nothing to protect", () => {
    expect(isLastActiveSuper([], 7)).toBe(false);
  });
});
