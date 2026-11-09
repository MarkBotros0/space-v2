/**
 * A titled part of a long form: a small header, the fields on one card, an
 * optional note under it. Breaks a column of a dozen fields into the few
 * questions it really asks (owner, 2026-11-07: the season form was one long
 * stack).
 */
import type { ReactNode } from "react";
import { View } from "react-native";

import { ListSectionHeader } from "../ui/grouped-list";
import { Text } from "../ui/text";

export function FormSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View className="flex-col gap-2">
      <ListSectionHeader className="pb-0">{title}</ListSectionHeader>
      <View className="flex-col gap-4 rounded-group bg-surface p-4">{children}</View>
      {note ? (
        <Text variant="caption" className="px-4 text-muted-foreground">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** Two short fields side by side, wrapping to a column on a narrow phone at large text. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-4">{children}</View>;
}

/** One cell of a FieldRow. */
export function FieldCell({ children, grow = 1 }: { children: ReactNode; grow?: 1 | 2 }) {
  return <View className={grow === 2 ? "min-w-[180px] flex-[2]" : "min-w-[130px] flex-1"}>{children}</View>;
}
