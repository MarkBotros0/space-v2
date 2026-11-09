/**
 * v1's signed-out page frame (app/login, forgot-password, reset-password):
 * `main flex min-h-dvh items-center justify-center px-4 py-12` > card
 * `w-full max-w-sm rounded-2xl border border-border/60 bg-card/90 p-6
 * shadow-[var(--shadow-pop)] backdrop-blur-md` > header `mb-6 flex flex-col
 * items-center gap-3 text-center` (Logo lg, h1, description).
 * Redesign: no box at all (owner, 2026-11-07, sign-in enhanced): the logo,
 * title and form sit on the page in one centred column, as a phone sign-in
 * does; a card inside the screen only narrowed the fields. Native differences: the frame scrolls,
 * keeps py-12 clear of the status and navigation bars (the app draws
 * edge-to-edge), and keeps the focused field above the keyboard
 * (useKeyboardInset; KeyboardAvoidingView does nothing on edge-to-edge
 * Android).
 */
import { cloneElement, type ReactElement, type ReactNode, useContext } from "react";
import { ChevronRight, Ticket } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { useKeyboardInset } from "../lib/keyboard-inset";
import { FieldError } from "../ui/field";
import { Logo } from "../ui/logo";
import { Text } from "../ui/text";

iconWithClassName(ChevronRight, Ticket);

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
          paddingBottom: Math.max((insets?.bottom ?? 0) + 48, keyboard.offset + 16),
        }}
      >
        <View testID="auth-column" className="w-full max-w-sm px-2">
          <View className="mb-8 flex-col items-center gap-4">
            <Logo size="lg" />
            <View className="flex-col gap-1">
              <Text
                accessibilityRole="header"
                variant="title"
                className="text-center text-foreground"
              >
                {title}
              </Text>
              <Text variant="subhead" className="text-center text-muted-foreground">
                {description}
              </Text>
            </View>
          </View>
          {children}
        </View>
      </ScrollView>
      {/* The page scrolls under the clock; a solid strip keeps text from colliding with the status bar. */}
      <View
        testID="auth-top-strip"
        pointerEvents="none"
        className="absolute inset-x-0 top-0 bg-background"
        style={{ height: insets?.top ?? 0 }}
      />
    </View>
  );
}

/**
 * v1's "Forgot password?" link: muted, the `subhead` variant, a 44pt target.
 * Centred by default; `end` puts it under a field's right edge.
 */
export function AuthLink({
  label,
  onPress,
  align = "center",
  tone = "muted",
}: {
  label: string;
  onPress: () => void;
  align?: "center" | "end";
  /** `accent`: the info colour (4.5:1 in both themes), for a link inside a sentence. */
  tone?: "muted" | "accent";
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className={cn(
        "min-h-[44px] justify-center active:opacity-70",
        align === "end" ? "items-end self-end" : "items-center",
      )}
    >
      <Text
        variant="subhead"
        className={cn("text-center font-medium", tone === "accent" ? "text-info" : "text-muted-foreground")}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** "or" between two ways in: a hairline each side of the word. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-separator" />
      <Text variant="caption" className="text-muted-foreground">
        {label}
      </Text>
      <View className="h-px flex-1 bg-separator" />
    </View>
  );
}

/** v1's bordered error / success boxes on the signed-out pages. */
const NOTICE_TONES = {
  error: { box: "bg-bad-soft", text: "text-bad" },
  success: { box: "bg-ok-soft", text: "text-ok" },
  // A next step rather than a failure (Google sign-in with no account yet).
  info: { box: "bg-info-soft", text: "text-foreground" },
} as const;

export function AuthNotice({
  tone,
  children,
}: {
  tone: keyof typeof NOTICE_TONES;
  children: ReactNode;
}) {
  return (
    <View className={cn("rounded-control px-3 py-2", NOTICE_TONES[tone].box)}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        variant="subhead"
        className={NOTICE_TONES[tone].text}
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
export function AuthField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactElement;
}) {
  const control = error
    ? cloneElement(
        children as ReactElement<{ accessibilityHint?: string; "aria-invalid"?: boolean }>,
        {
          accessibilityHint: error,
          "aria-invalid": true,
        },
      )
    : children;
  return (
    <View className="flex-col gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      {control}
      <FieldError>{error}</FieldError>
    </View>
  );
}

/**
 * The way in for someone who was invited (owner, 2026-11-07: the invite code
 * must be very clear): a full-width row of its own with a ticket, saying what
 * the code is for and where it came from, never a small link.
 */
export function InviteCodeCallout({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="I have an invite code"
      accessibilityHint="Opens the screen to enter the code from your invite email"
      onPress={onPress}
      className="min-h-[64px] flex-row items-center gap-3 rounded-control border border-info bg-info-soft px-4 py-3 active:opacity-70"
    >
      <View className="size-10 shrink-0 items-center justify-center rounded-full bg-surface">
        <Ticket size={20} className="text-info" />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="headline" className="text-foreground">
          I have an invite code
        </Text>
        <Text variant="subhead" className="text-muted-foreground">
          New to JPC Space? Enter the code from your invite email to set up your account.
        </Text>
      </View>
      <ChevronRight size={18} className="shrink-0 text-info" />
    </Pressable>
  );
}
