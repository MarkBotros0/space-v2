import { popoverVertical } from "../design/lib/anchored-popover";

const base = { sideOffset: 6, winHeight: 640, insetTop: 24, insetBottom: 48 };
const picker = 330;

describe("popoverVertical (sweep K3)", () => {
  it("opens below the trigger when it fits above the bottom inset", () => {
    const r = popoverVertical({ ...base, anchor: { x: 0, y: 100, width: 300, height: 44 }, popupHeight: picker });
    expect(r.top).toBe(150);
    expect(r.bottom).toBeUndefined();
  });

  it("flips above when below would run under the nav bar and there is room above", () => {
    const r = popoverVertical({ ...base, anchor: { x: 0, y: 420, width: 300, height: 44 }, popupHeight: picker });
    expect(r.top).toBeUndefined();
    expect(r.bottom).toBe(640 - 420 + 6);
  });

  it("shifts up to sit on the bottom limit when it fits neither below nor above", () => {
    const r = popoverVertical({ ...base, anchor: { x: 0, y: 250, width: 300, height: 44 }, popupHeight: picker });
    expect(r.top).toBe(640 - 48 - 8 - picker);
    expect(r.top! + picker).toBeLessThanOrEqual(640 - 48);
  });

  it("never starts above the top limit and caps its height to the usable window", () => {
    const r = popoverVertical({ ...base, anchor: { x: 0, y: 250, width: 300, height: 44 }, popupHeight: 900 });
    expect(r.top).toBe(24 + 8);
    expect(r.maxHeight).toBe(640 - 48 - 8 - 32);
  });
});
