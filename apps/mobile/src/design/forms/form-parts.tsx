/**
 * Pieces v1's admin forms repeat verbatim (session, group, assignment,
 * season, user forms):
 *  - FormErrorBox: `<p className="rounded-md bg-error-50 px-3 py-2 text-sm text-error-800">`
 *  - FormActions: Cancel (outline) + submit in `flex flex-col-reverse gap-2`;
 *    on a phone that column puts the submit button above Cancel.
 *  - ToggleButtons: the two/three-way `flex gap-2` button row v1 draws for
 *    "Session type": `flex-1 rounded-lg border px-3 py-2 text-sm font-semibold`,
 *    selected `border-brand-teal-500 bg-brand-teal-50 text-brand-teal-800`.
 */
import { Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { Button } from "../ui/button";
import { Text } from "../ui/text";

export function FormErrorBox({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" className="rounded-md bg-error-50 px-3 py-2 dark:bg-error-950">
      <Text className="text-sm text-error-800 dark:text-error-200">{message}</Text>
    </View>
  );
}

export function FormActions({
  submitLabel,
  pendingLabel = "Saving…",
  pending,
  onSubmit,
  onCancel,
  submitDisabled,
}: {
  submitLabel: string;
  pendingLabel?: string;
  pending: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
  submitDisabled?: boolean;
}) {
  return (
    <View className="flex-col gap-2">
      <Button disabled={pending || submitDisabled} onPress={onSubmit}>
        {pending ? pendingLabel : submitLabel}
      </Button>
      {onCancel ? (
        <Button variant="outline" disabled={pending} onPress={onCancel}>
          Cancel
        </Button>
      ) : null}
    </View>
  );
}

export function ToggleButtons<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" className="flex-row gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            className={cn(
              "flex-1 items-center rounded-lg border px-3 py-2",
              selected
                ? "border-brand-teal-500 bg-brand-teal-50 dark:bg-brand-teal-950"
                : "border-border bg-card active:border-brand-teal-300",
            )}
          >
            <Text
              className={cn(
                "text-sm font-semibold",
                selected ? "text-brand-teal-800 dark:text-brand-teal-200" : "text-muted-foreground",
              )}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
