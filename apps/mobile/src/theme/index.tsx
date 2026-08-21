import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { colors, radii, spacing, typography } from "./tokens";

export type Theme = {
  colors: typeof colors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
};

/**
 * Single light theme for Phase 0. Dark mode is not in scope yet — keeping a
 * provider with one value now means adding a second theme later is a change
 * in this file, not a rewrite of every screen that reads useTheme().
 */
const theme: Theme = { colors, spacing, radii, typography };

const ThemeContext = createContext<Theme>(theme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
