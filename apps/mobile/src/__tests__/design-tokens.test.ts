import tokens from "../../../../docs/superpowers/ui-rebuild/v1-tokens.json";
const theme = require("../design/theme/tailwind-theme.js");
const config = require("../../tailwind.config.js");
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(__dirname, "../../global.css"), "utf8");

describe("generated design tokens", () => {
  it("semantic colours are CSS variables with an alpha slot", () => {
    expect(theme.colors.primary).toBe("rgb(var(--primary) / <alpha-value>)");
    expect(theme.colors.sidebar).toBe("rgb(var(--sidebar) / <alpha-value>)");
  });

  it("light and dark values come from v1-tokens.json", () => {
    const hexToTriplet = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
    expect(css).toContain(`--card: ${hexToTriplet(tokens.light.card)};`);
    const darkBlock = css.slice(css.indexOf(".dark:root"));
    expect(darkBlock).toContain(`--background: ${hexToTriplet(tokens.dark.background)};`);
  });

  it("translucent tokens keep their own alpha and still take an opacity modifier", () => {
    const darkBlock = css.slice(css.indexOf(".dark:root"));
    expect(darkBlock).toContain("--border: 255 255 255;");
    expect(darkBlock).toContain("--border-alpha: 0.08;");
    // v1 writes border-border/60 (12×): the modifier multiplies the token's alpha.
    expect(theme.colors.border({ opacityValue: "0.6" })).toBe("rgb(var(--border) / calc(var(--border-alpha) * 0.6))");
    expect(theme.colors.border({})).toBe("rgb(var(--border) / var(--border-alpha))");
  });

  it("every integer opacity modifier exists (v1 writes bg-primary/92)", () => {
    expect(config.theme.extend.opacity["92"]).toBe("0.92");
    expect(config.theme.extend.opacity["7"]).toBe("0.07");
  });

  it("ramps are literal hex identical to v1", () => {
    expect(theme.colors["brand-navy"]["900"]).toBe("#1F3260");
    expect(theme.colors["brand-teal"]["500"]).toBe("#7DCED1");
    expect(theme.colors.role.leader).toBe(tokens.light["role-leader"]);
  });

  it("radius scale is v1's, in px", () => {
    expect(theme.borderRadius.lg).toBe(`${tokens.radius.lg}px`);
    expect(theme.borderRadius["2xl"]).toBe(`${tokens.radius["2xl"]}px`);
    expect(theme.borderRadius.DEFAULT).toBe("4px");
  });

  it("v1 shadow tokens exist as named shadows", () => {
    expect(theme.boxShadow.soft).toBe(tokens.shadows.soft);
    expect(theme.boxShadow.lift).toBe(tokens.shadows.lift);
  });

  it("semantic values per theme are available to props that cannot take a class", () => {
    expect(theme.semantic.light["muted-foreground"]).toBe(tokens.light["muted-foreground"]);
    expect(theme.semantic.dark.border).toBe(tokens.dark.border);
  });

  it("font weights map to Geist faces", () => {
    expect(theme.fontWeightUtilities[".font-semibold"]).toEqual({
      fontFamily: "Geist_600SemiBold",
      fontWeight: "600",
    });
    expect(theme.fontWeightUtilities[".font-normal"].fontFamily).toBe("Geist_400Regular");
  });
});
