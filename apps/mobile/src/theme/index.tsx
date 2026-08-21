import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { UserRole } from "@space/shared";

import { borderWidths, colors, opacity, radii, spacing, typography } from "./tokens";

// Re-export the raw tokens so `../theme` is one entry point: screens use
// useTheme() from here, but StyleSheet.create blocks can't call a hook and
// need the static values directly from the same import path.
export * from "./tokens";

/**
 * `tokens.ts` keeps `colors` `as const` so callers get autocomplete on exact
 * hex literals. But that means `typeof colors` isn't a shape — it's the one
 * concrete palette, down to each ramp step's literal string type. A second
 * (e.g. dark) palette assigned to that type fails to compile even though its
 * shape is identical, because `"#0B0F19"` is not `"#FAFAFB"`. `ThemeColors`
 * below widens every hex value to `string`, so `Theme` describes the shape a
 * palette must have, not the one palette that happens to exist today.
 */
type RampStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
type Ramp = Record<RampStep, string>;

interface RoleColors {
  background: string;
  foreground: string;
}

export interface ThemeColors {
  brand: {
    navy: Ramp;
    teal: Ramp;
  };
  neutral: Ramp;
  success: Ramp;
  warning: Ramp;
  error: Ramp;
  info: Ramp;
  purple: Ramp;
  role: Record<UserRole, RoleColors>;
  white: string;
  black: string;
  transparent: string;
}

export type Theme = {
  colors: ThemeColors;
  // typography's fontWeight is a literal union in React Native's TextStyle
  // ("400" | "600" | ...); widening it to string would break every consumer
  // that spreads it into a style prop. spacing and radii are plain numbers,
  // so there's nothing to widen either — only colors needs the ThemeColors
  // treatment above.
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  borderWidths: typeof borderWidths;
  opacity: typeof opacity;
};

/**
 * Single light theme for Phase 0. Dark mode is not in scope yet — keeping a
 * provider with one value now means adding a second theme later is a change
 * in this file, not a rewrite of every screen that reads useTheme().
 */
const theme: Theme = { colors, spacing, radii, typography, borderWidths, opacity };

const ThemeContext = createContext<Theme>(theme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
