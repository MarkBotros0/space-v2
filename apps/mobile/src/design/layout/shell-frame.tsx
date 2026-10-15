import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

/**
 * v1 shell-frame.tsx `<main className="mx-auto w-full max-w-7xl flex-1 px-4
 * pb-24 pt-4">`. `pb-24` keeps the last row clear of the floating tab bar.
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
  if (!scroll) {
    return <View className="flex-1 bg-brand-navy-50 px-4 pb-24 pt-4 dark:bg-background">{children}</View>;
  }
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="bg-brand-navy-50 px-4 pb-24 pt-4 dark:bg-background"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}
