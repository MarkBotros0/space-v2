import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { useKeyboardInset } from "../lib/keyboard-inset";
import { useShellBottomPadding } from "./shell-context";

/**
 * v1 shell-frame.tsx `<main className="mx-auto w-full max-w-7xl flex-1 px-4
 * pb-24 pt-4">`. `pb-24` keeps the last row clear of the floating tab bar;
 * natively the padding grows with the bottom inset, as the bar does
 * (useShellBottomPadding), and with the keyboard while it is open, so a
 * form's fields and buttons scroll above it (useKeyboardInset).
 * The top bar (rendered above this) owns the top safe-area inset.
 * Background: every v1 role layout wraps its pages in `bg-brand-navy-50
 * dark:bg-transparent … pb-24` (app/<role>/layout.tsx); the tint ends 96px
 * below the content, so a short page shows the plain background under it.
 * `onRefresh` adds pull-to-refresh (v2-only; v1 pages are server-rendered).
 */
export function ShellFrame({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const bottom = useShellBottomPadding();
  const keyboard = useKeyboardInset();
  if (!scroll) {
    return (
      <View className="flex-1 bg-brand-navy-50 px-4 pt-4 dark:bg-background" style={{ paddingBottom: bottom }}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      {...keyboard.scrollProps}
      className="flex-1 bg-background"
      contentContainerClassName="bg-brand-navy-50 px-4 pt-4 dark:bg-background"
      contentContainerStyle={{ paddingBottom: Math.max(bottom, keyboard.inset + 16) }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}
