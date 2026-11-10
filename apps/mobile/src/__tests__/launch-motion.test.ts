import {
  backgroundPath,
  dotPosition,
  LAUNCH,
  LAUNCH_DOT_RADIUS,
  logoDotsOnScreen,
  openingTurn,
  openRadius,
} from "../design/brand/launch-motion";

const W = 390;
const H = 844;
const centre = { x: W / 2, y: H / 2 };
const far = openRadius(W, H);

describe("launch motion", () => {
  it("puts the logo's dots at the left of the centred logo, one above the other", () => {
    const [top, bottom] = logoDotsOnScreen(W, H);
    expect(top.x).toBeCloseTo(bottom.x);
    expect(top.x).toBeLessThan(centre.x);
    expect(top.y).toBeLessThan(bottom.y);
  });

  it("starts each dot in the logo and gathers it onto the loader's circle, top and bottom", () => {
    const [top, bottom] = logoDotsOnScreen(W, H);
    expect(dotPosition(0, top, centre, far, 0, 0, 0)).toEqual(top);
    const gatheredTop = dotPosition(0, top, centre, far, 0.9999, 0, 0);
    expect(gatheredTop.x).toBeCloseTo(centre.x, 1);
    expect(gatheredTop.y).toBeCloseTo(centre.y - LAUNCH.orbitRadius, 1);
    const gatheredBottom = dotPosition(1, bottom, centre, far, 0.9999, 0, 0);
    expect(gatheredBottom.y).toBeCloseTo(centre.y + LAUNCH.orbitRadius, 1);
  });

  it("joins the gather seamlessly to the orbit", () => {
    const [top] = logoDotsOnScreen(W, H);
    const before = dotPosition(0, top, centre, far, 0.99999, 0, 0);
    const after = dotPosition(0, top, centre, far, 1, 0, 0);
    expect(after.x).toBeCloseTo(before.x, 2);
    expect(after.y).toBeCloseTo(before.y, 2);
  });

  it("keeps the two dots opposite each other as they turn", () => {
    const [top, bottom] = logoDotsOnScreen(W, H);
    const a = dotPosition(0, top, centre, far, 1, 1.2, 0);
    const b = dotPosition(1, bottom, centre, far, 1, 1.2, 0);
    expect((a.x + b.x) / 2).toBeCloseTo(centre.x);
    expect((a.y + b.y) / 2).toBeCloseTo(centre.y);
    expect(Math.hypot(a.x - centre.x, a.y - centre.y)).toBeCloseTo(LAUNCH.orbitRadius);
  });

  it("opens the circle until the hole clears every corner and the dots are off screen", () => {
    const [top] = logoDotsOnScreen(W, H);
    expect(far - LAUNCH.orbitRadius).toBeGreaterThan(Math.hypot(W / 2, H / 2));
    const out = dotPosition(0, top, centre, far, 1, 0.3, 1);
    expect(Math.hypot(out.x - centre.x, out.y - centre.y)).toBeGreaterThan(
      Math.hypot(W / 2, H / 2) + LAUNCH_DOT_RADIUS,
    );
  });

  it("starts the opening at the loader's own speed (ease-out cubic starts at 3x its average)", () => {
    const loaderSpeed = (2 * Math.PI) / LAUNCH.spinPeriodMs;
    expect((3 * openingTurn()) / LAUNCH.openMs).toBeCloseTo(loaderSpeed);
  });

  it("draws the background whole until the opening, then with a hole at the centre", () => {
    expect(backgroundPath(W, H, centre, 0)).toBe(`M0 0H${W}V${H}H0Z`);
    const withHole = backgroundPath(W, H, centre, 40);
    expect(withHole.startsWith(`M0 0H${W}V${H}H0Z`)).toBe(true);
    expect(withHole).toContain(`M${centre.x - 40} ${centre.y}a40 40`);
  });
});
