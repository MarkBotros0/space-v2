/**
 * Redesign empty state: a quiet centred block on the surface (no dashed box,
 * no gradient), a tinted icon disc, title and description, and an optional
 * action. `action` is either `{ label, onPress }` (rendered as a secondary
 * Button) or, for existing call sites, a ready-made node.
 */
import type { LucideIcon } from "lucide-react-native";
import { isValidElement, type ReactNode } from "react";
import { View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Text } from "./text";

type EmptyAction = { label: string; onPress: () => void };

function isEmptyAction(a: unknown): a is EmptyAction {
  return !!a && typeof a === "object" && !isValidElement(a) && "label" in a && "onPress" in a;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyAction | ReactNode;
  className?: string;
}) {
  if (Icon) iconWithClassName(Icon);
  return (
    <View className={cn("flex-col items-center justify-center gap-4 rounded-2xl bg-surface px-6 py-12", className)}>
      {Icon ? (
        <View className="h-14 w-14 items-center justify-center rounded-full bg-info-soft">
          <Icon size={24} className="text-info" />
        </View>
      ) : null}
      <View className="max-w-md flex-col items-center gap-1.5">
        <Text variant="headline" className="text-center text-foreground">
          {title}
        </Text>
        {description ? <Text variant="subhead" className="text-center text-muted-foreground">{description}</Text> : null}
      </View>
      {action ? (
        <View className="mt-1">
          {isEmptyAction(action) ? (
            <Button variant="secondary" onPress={action.onPress}>
              {action.label}
            </Button>
          ) : (
            (action as ReactNode)
          )}
        </View>
      ) : null}
    </View>
  );
}

export { EmptyState };
