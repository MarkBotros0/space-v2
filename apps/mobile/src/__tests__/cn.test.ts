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
  // tailwind-merge knows the named radii (tokens.json radius: group, control, sheet), so a
  // later radius replaces an earlier one whichever kind each is.
  it("keeps only the last radius, named or not", () => {
    expect(cn("rounded-group rounded-full")).toBe("rounded-full");
    expect(cn("rounded-full", "rounded-group")).toBe("rounded-group");
    expect(cn("rounded-control", "rounded-lg")).toBe("rounded-lg");
    expect(cn("rounded-t-sheet rounded-t-none")).toBe("rounded-t-none");
  });
  it("named type sizes replace each other and never swallow a colour", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
    expect(cn("text-caption", "text-foreground")).toBe("text-caption text-foreground");
  });
});
