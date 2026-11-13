import { View } from "react-native";
import { Pressable } from "../../../design/ui/pressable";
import type { AnnouncementPoll } from "@space/shared";

import { cn } from "../../../design/lib/cn";
import { Button, Checkbox, Text } from "../../../design/ui";
import { POLL_COPY } from "./poll-copy";

/** The drawn radio: the row is the control, so a screen reader meets one radio per option. */
function RadioDot({ checked }: { checked: boolean }) {
  return (
    <View
      className={cn(
        "size-5 shrink-0 items-center justify-center rounded-full border",
        checked ? "border-primary" : "border-control-border",
      )}
    >
      {checked ? <View className="size-2.5 rounded-full bg-primary" /> : null}
    </View>
  );
}

/**
 * Before voting (or after Change vote / Vote): one full-width row per option, a
 * radio on a one-answer poll, a checkbox on a several-answer one, then Vote,
 * disabled until something is ticked so a stray tap never casts a vote.
 */
export function PollChoices({
  poll,
  picked,
  onToggle,
  onVote,
  pending,
}: {
  poll: AnnouncementPoll;
  picked: readonly number[];
  onToggle: (optionId: number) => void;
  onVote: () => void;
  pending: boolean;
}) {
  const role = poll.allowsMultiple ? "checkbox" : "radio";
  return (
    <View className="flex-col gap-2">
      <View accessibilityRole={poll.allowsMultiple ? undefined : "radiogroup"} className="flex-col gap-2">
        {poll.options.map((option) => {
          const checked = picked.includes(option.id);
          return (
            <Pressable
              key={option.id}
              accessibilityRole={role}
              accessibilityLabel={option.label}
              accessibilityState={{ checked }}
              disabled={pending}
              onPress={() => onToggle(option.id)}
              className={cn(
                "min-h-[44px] w-full flex-row items-center gap-3 rounded-control border px-4 py-3",
                checked ? "border-ring bg-accent" : "border-control-border bg-surface",
              )}
            >
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {poll.allowsMultiple ? (
                  <Checkbox checked={checked} onCheckedChange={() => {}} accessibilityLabel={option.label} />
                ) : (
                  <RadioDot checked={checked} />
                )}
              </View>
              <Text
                variant="subhead"
                className={cn("min-w-0 flex-1 font-medium", checked ? "text-accent-foreground" : "text-foreground")}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button className="self-start" disabled={picked.length === 0 || pending} loading={pending} onPress={onVote}>
        {POLL_COPY.vote}
      </Button>
    </View>
  );
}
