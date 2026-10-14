import { createContext, useContext } from "react";

/**
 * True inside the authenticated shell, where v1's top bar owns the top
 * safe-area inset and the floating tab bar covers the bottom 96px (v1's
 * `pb-24` on <main>). Legacy `Screen` reads it so not-yet-rebuilt screens sit
 * correctly between the two.
 */
export const ShellContext = createContext(false);

export function useInShell(): boolean {
  return useContext(ShellContext);
}

/** v1 shell-frame.tsx <main> bottom padding that keeps content clear of the tab bar. */
export const SHELL_BOTTOM_PADDING = 96;
