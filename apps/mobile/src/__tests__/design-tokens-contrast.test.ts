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
  ];
  it.each(pairs)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(rgbOf(t[fg]), rgbOf(t[bg]))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["white", "#FFFFFF"],
    ["brand-navy-950", (tokens.light as Theme)["brand-navy-950"]],
  ])("pill text reads over %s", (_label, under) => {
    const bg = composite(t.pill, under as string);
    expect(contrast(rgbOf(t["pill-foreground"]), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgbOf(t["pill-active"]), bg)).toBeGreaterThanOrEqual(3);
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
