import { cn } from "../design/lib/cn";

describe("cn", () => {
  it("merges conflicting tailwind classes, last wins (v1 lib/utils semantics)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
  it("treats the custom font weights as one group", () => {
    expect(cn("font-medium", "font-semibold")).toBe("font-semibold");
  });
});
