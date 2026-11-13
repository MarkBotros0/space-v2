/**
 * React Native's Pressable with one difference: a press that ends a sideways
 * swipe is dropped (`design/lib/swipe-guard.ts`), so a swipe across a row
 * changes tab and never opens the row. Every Pressable in the app comes from
 * here; lint refuses the one from react-native.
 */
import type { ComponentProps } from "react";
// eslint-disable-next-line no-restricted-imports -- the one place the raw Pressable is wrapped
import { Pressable as RNPressable, type GestureResponderEvent } from "react-native";

import { swipeBlocksTap } from "../lib/swipe-guard";

export function Pressable({ onPress, onLongPress, ...props }: ComponentProps<typeof RNPressable>) {
  return (
    <RNPressable
      {...props}
      onPress={
        onPress
          ? (e: GestureResponderEvent) => {
              if (!swipeBlocksTap()) onPress(e);
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? (e: GestureResponderEvent) => {
              if (!swipeBlocksTap()) onLongPress(e);
            }
          : undefined
      }
    />
  );
}
