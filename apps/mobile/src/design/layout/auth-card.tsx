/**
 * v1's signed-out page frame (app/login, forgot-password, reset-password):
 * `main flex min-h-dvh items-center justify-center px-4 py-12` > card
 * `w-full max-w-sm rounded-2xl border border-border/60 bg-card/90 p-6
 * shadow-[var(--shadow-pop)] backdrop-blur-md` > header `mb-6 flex flex-col
 * items-center gap-3 text-center` (Logo lg, h1, description).
 * Native differences: no backdrop blur (bg-card/90 kept); the frame scrolls,
 * keeps py-12 clear of the status and navigation bars (the app draws
 * edge-to-edge), and keeps the focused field above the keyboard
 * (useKeyboardInset; KeyboardAvoidingView does nothing on edge-to-edge
 * Android).
 */
import { cloneElement, type ReactElement, type ReactNode, useContext } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { cn } from "../lib/cn";
import { useKeyboardInset } from "../lib/keyboard-inset";
import { shadowStyle } from "../lib/shadow";
import { FieldError } from "../ui/field";
import { Logo } from "../ui/logo";
import { Text } from "../ui/text";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const insets = useContext(SafeAreaInsetsContext);
  const keyboard = useKeyboardInset();
  return (
    <View className="flex-1 bg-background">
      <ScrollView
        {...keyboard.scrollProps}
        className="flex-1"
        contentContainerClassName="min-h-full items-center justify-center px-4"
        contentContainerStyle={{
          paddingTop: (insets?.top ?? 0) + 48,
          paddingBottom: Math.max((insets?.bottom ?? 0) + 48, keyboard.inset + 16),
        }}
      >
        <View className="w-full max-w-sm rounded-2xl border border-border/60 bg-card/90 p-6" style={shadowStyle("pop")}>
          <View className="mb-6 flex-col items-center gap-3">
            <Logo size="lg" />
            <View className="flex-col gap-1">
              <Text
                accessibilityRole="header"
                className="text-center text-2xl font-semibold tracking-tight text-foreground"
              >
                {title}
              </Text>
              <Text className="text-center text-sm text-muted-foreground">{description}</Text>
            </View>
          </View>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

/** v1's "Forgot password?" link: `text-center text-sm text-muted-foreground`. */
export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} className="active:opacity-70">
      <Text className="text-center text-sm text-muted-foreground">{label}</Text>
    </Pressable>
  );
}

/** v1's bordered error / success boxes on the signed-out pages. */
export function AuthNotice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <View
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "error"
          ? "border-error-200 bg-error-50 dark:border-error-900 dark:bg-error-950"
          : "border-success-200 bg-success-50 dark:border-success-900 dark:bg-success-950",
      )}
    >
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        className={cn(
          "text-sm",
          tone === "error" ? "text-error-700 dark:text-error-200" : "text-success-700 dark:text-success-200",
        )}
      >
        {children}
      </Text>
    </View>
  );
}

/**
 * v1's signed-out field: `label flex flex-col gap-1.5 text-sm` > span
 * `font-medium text-foreground` (body line height, not Label's leading-none).
 * An error reaches the control as its accessibilityHint, like FormField.
 */
export function AuthField({ label, error, children }: { label: string; error?: string; children: ReactElement }) {
  const control = error
    ? cloneElement(children as ReactElement<{ accessibilityHint?: string; "aria-invalid"?: boolean }>, {
        accessibilityHint: error,
        "aria-invalid": true,
      })
    : children;
  return (
    <View className="flex-col gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      {control}
      <FieldError>{error}</FieldError>
    </View>
  );
}
