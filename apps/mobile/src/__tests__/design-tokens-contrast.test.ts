import tokens from "../design/theme/tokens.json";

type Theme = Record<string, string>;
const themes: Record<string, Theme> = { light: tokens.light, dark: tokens.dark } as Record<string, Theme>;

function parse(value: string): { rgb: number[]; alpha: number } {
  if (value.startsWith("#")) {
    return { rgb: [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)), alpha: 1 };
  }
  const m = value.match(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/);
  if (!m) throw new Error(`Unrecognised colour ${value}`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) };
}

function luminance(rgb: number[]): number {
  const [r = 0, g = 0, b = 0] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const rgbOf = (value: string | undefined) => parse(value ?? "").rgb;

function composite(over: string | undefined, under: string): number[] {
  const { rgb, alpha } = parse(over ?? "");
  const base = parse(under).rgb;
  return rgb.map((c, i) => c * alpha + (base[i] ?? 0) * (1 - alpha));
}

describe.each(Object.entries(themes))("%s theme contrast", (_name, t) => {
  const pairs: [string, string][] = [
    ["foreground", "background"],
    ["muted-foreground", "surface"],
    ["muted-foreground", "background"],
    ["primary-foreground", "primary"],
    ["ok", "ok-soft"],
    ["warn", "warn-soft"],
    ["bad", "bad-soft"],
    ["info", "info-soft"],
    ["neutral-strong", "neutral-soft"],
    // Info-tone text on a card (the alumni welcome eyebrow).
    ["info", "surface"],
    // Notification bell: links on the popover, an unread row's text on its tint.
    ["info", "popover"],
    ["info", "surface-raised"],
    ["popover-foreground", "unread-soft"],
    ["muted-foreground", "unread-soft"],
    // A disabled button: the muted label on the neutral fill.
    ["muted-foreground", "neutral-soft"],
    ["foreground", "surface-raised"],
    // Menus and pickers (popover is surface-raised in dark).
    ["popover-foreground", "popover"],
    ["muted-foreground", "popover"],
    // Role badges: each role's label on its own fill.
    ["role-super-foreground", "role-super"],
    ["role-admin-foreground", "role-admin"],
    ["role-leader-foreground", "role-leader"],
    ["role-mentor-foreground", "role-mentor"],
    ["role-student-foreground", "role-student"],
    ["role-alumni-foreground", "role-alumni"],
  ];
  it.each(pairs)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(rgbOf(t[fg]), rgbOf(t[bg]))).toBeGreaterThanOrEqual(4.5);
  });

  // R25: control borders (inputs, secondary buttons, triggers) are 3:1 against what they sit on.
  it.each(["background", "surface"])("control-border on %s is at least 3:1 (L7)", (bg) => {
    expect(contrast(rgbOf(t["control-border"]), rgbOf(t[bg]))).toBeGreaterThanOrEqual(3);
  });

  // R26: the focus ring is a control edge too, and never weaker than the resting border.
  it.each(["background", "surface"])("ring on %s is at least 3:1 and at least the control border's contrast", (bg) => {
    const ring = contrast(rgbOf(t.ring), rgbOf(t[bg]));
    expect(ring).toBeGreaterThanOrEqual(3);
    expect(ring).toBeGreaterThanOrEqual(contrast(rgbOf(t["control-border"]), rgbOf(t[bg])));
  });

  // The bell's count: white on error-600 (error-500 was 3.8:1).
  it("the bell count is at least 4.5:1", () => {
    expect(contrast(rgbOf("#FFFFFF"), rgbOf(t["error-600"]))).toBeGreaterThanOrEqual(4.5);
  });

  // SegmentedControl: the selected thumb must read as raised (lighter than its track).
  it("surface-raised is lighter than the neutral-soft track (L5)", () => {
    expect(luminance(rgbOf(t["surface-raised"]))).toBeGreaterThan(luminance(rgbOf(t["neutral-soft"])));
  });

  it.each([
    ["white", "#FFFFFF"],
    ["brand-navy-950", (tokens.light as Theme)["brand-navy-950"]],
  ])("pill text reads over %s", (_label, under) => {
    for (const fill of [t.pill, t["pill-solid"]]) {
      const bg = composite(fill, under as string);
      expect(contrast(rgbOf(t["pill-foreground"]), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgbOf(t["pill-active"]), bg)).toBeGreaterThanOrEqual(3);
    }
  });

  // R30: Android has no blur, so its fill must all but hide what scrolls beneath it.
  it("pill-solid is at least 0.9 opaque and more opaque than pill", () => {
    const solid = parse(t["pill-solid"] ?? "").alpha;
    expect(solid).toBeGreaterThanOrEqual(0.9);
    expect(solid).toBeGreaterThan(parse(t.pill ?? "").alpha);
  });

  // The active tab: the pill over white (worst case), then the 20% teal highlight over that.
  it("active tab label, icon and idle label read on the highlighted pill (R18)", () => {
    const pill = composite(t.pill, "#FFFFFF");
    const active = parse(t["pill-active"] ?? "").rgb;
    const lit = pill.map((c, i) => active[i]! * 0.2 + c * 0.8);
    expect(contrast(rgbOf(t["pill-active-label"]), lit)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(active, lit)).toBeGreaterThanOrEqual(3);
    expect(contrast(rgbOf(t["pill-foreground"]), pill)).toBeGreaterThanOrEqual(4.5);
  });
});

// An unread row in dark reads as tinted and lifted, never darker than a read one (sweep
// s29-05); in light the tint is the pale info-50 on white.
it("dark unread-soft is no darker than the popover it sits on", () => {
  const dark = tokens.dark as Theme;
  expect(luminance(rgbOf(dark["unread-soft"]))).toBeGreaterThanOrEqual(luminance(rgbOf(dark.popover)));
});

// The unread dot (notification bell) is the row's one non-hue marker: 3:1 on the unread
// tint in both themes. Light info-500, dark info-300 (info-500 was 2.5:1 on dark unread-soft).
it.each([
  ["light", "info-500"],
  ["dark", "info-300"],
] as const)("the %s unread dot (%s) is at least 3:1 on unread-soft", (theme, dot) => {
  const t = themes[theme]!;
  expect(contrast(rgbOf(t[dot]), rgbOf(t["unread-soft"]))).toBeGreaterThanOrEqual(3);
});
