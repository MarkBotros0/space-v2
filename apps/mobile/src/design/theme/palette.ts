/**
 * v1's colour ramps as raw hex, for the few places that take a colour value
 * rather than a class (SVG strokes and fills, inline text colours computed
 * from data). Read from the generated tailwind-theme.js, so they cannot drift
 * from the classes. For theme-dependent semantic colours (background,
 * foreground, border, ...) use useThemeColors() instead.
 */
type RampStep = "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950";
type Ramp = Record<RampStep, string>;
type RampName = "brand-navy" | "brand-teal" | "neutral" | "success" | "warning" | "error" | "info" | "purple";

const { colors } = require("./tailwind-theme.js") as { colors: Record<RampName, Ramp> };

export const palette: Record<RampName, Ramp> = {
  "brand-navy": colors["brand-navy"],
  "brand-teal": colors["brand-teal"],
  neutral: colors.neutral,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  info: colors.info,
  purple: colors.purple,
};
