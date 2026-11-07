/**
 * The logo's own colours, sampled from assets/icon.png (close to, but not,
 * brand-navy-900 / brand-teal-500).
 *
 * The launch screen sits on the app's own `background` in each theme, so
 * nothing changes colour between the splash and the first screen (owner,
 * 2026-11-07). The logo's ink follows the theme for contrast: navy on the
 * light background (11.2:1), teal on the dark one (9.6:1). Teal on the light
 * background is 1.8:1, under the 3:1 a graphic needs.
 */
export const LOGO_COLORS = { navy: "#22355F", teal: "#67CBCD" } as const;

export function logoInk(scheme: "light" | "dark"): string {
  return scheme === "dark" ? LOGO_COLORS.teal : LOGO_COLORS.navy;
}
