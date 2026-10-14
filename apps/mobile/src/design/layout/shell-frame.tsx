import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

/**
 * v1 shell-frame.tsx `<main className="mx-auto w-full max-w-7xl flex-1 px-4
 * pb-24 pt-4">`. `pb-24` keeps the last row clear of the floating tab bar.
 * The top bar (rendered above this) owns the top safe-area inset.
 */
export function ShellFrame({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) {
    return <View className="flex-1 bg-background px-4 pb-24 pt-4">{children}</View>;
  }
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-24 pt-4">
      {children}
    </ScrollView>
  );
}
