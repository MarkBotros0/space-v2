import { colors, radii, spacing, typography } from "../theme/tokens";

describe("theme tokens", () => {
  it("anchors the brand on v1's logo colours", () => {
    // From jpc-space/src/app/globals.css — the navy is the logo background and
    // the teal the monogram. Changing these makes the two apps look unrelated
    // while both are live.
    expect(colors.brand.navy[900]).toBe("#1F3260");
    expect(colors.brand.teal[500]).toBe("#7DCED1");
  });

  it("exposes a full ramp for each brand colour", () => {
    for (const ramp of [colors.brand.navy, colors.brand.teal, colors.neutral]) {
      for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const) {
        expect(ramp[step]).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it("provides semantic colours for status, named as v1 names them", () => {
    // v1's globals.css calls the destructive ramp `error`, not `danger`, and
    // also ships `info` and `purple`. Matching its vocabulary means a
    // developer reading both codebases sees one set of names.
    for (const key of ["success", "warning", "error", "info"] as const) {
      expect(colors[key][500]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("gives every role the badge colour v1 gives it", () => {
    // v1's globals.css defines a background/foreground pair per role and uses
    // them for badges on nearly every page. Porting them here rather than in
    // Phase 1 stops 104 screens each inventing their own.
    for (const role of ["SUPER", "ADMIN", "LEADER", "STUDENT", "MENTOR"] as const) {
      expect(colors.role[role].background).toMatch(/^#[0-9A-F]{6}$/i);
      expect(colors.role[role].foreground).toMatch(/^#[0-9A-F]{6}$/i);
    }
    // Pinned by reference, not by hex: v1 aliases these with var(), so the
    // badge must stay equal to the ramp it points at even if the ramp changes.
    expect(colors.role.SUPER.background).toBe(colors.brand.navy[900]);
    expect(colors.role.ADMIN.background).toBe(colors.brand.teal[500]);
    expect(colors.role.LEADER.background).toBe(colors.purple[500]);
    expect(colors.role.STUDENT.background).toBe(colors.warning[500]);
    expect(colors.role.MENTOR.background).toBe(colors.success[500]);
  });

  it("uses a 4pt spacing scale", () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
    expect(spacing.xl).toBe(32);
  });

  it("defines the type scale used by the Text primitive", () => {
    for (const key of ["display", "title", "heading", "body", "label", "caption"] as const) {
      expect(typography[key].fontSize).toBeGreaterThan(0);
      expect(typography[key].lineHeight).toBeGreaterThanOrEqual(typography[key].fontSize);
    }
  });

  it("defines radii", () => {
    expect(radii.sm).toBeGreaterThan(0);
    expect(radii.full).toBeGreaterThanOrEqual(999);
  });
});
