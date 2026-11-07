/**
 * The switchable part of a student's page: a row of choice chips (Seasons,
 * Attendance, Submissions, Notes) over the chosen section. Chips wrap on a
 * small phone instead of scrolling off it, and nothing is underlined (owner,
 * 2026-11-07). A section mounts the first time it is chosen and then stays
 * mounted, hidden, so its cache and scroll state survive a switch (spec 06 §9).
 * With a single section there is nothing to choose: it shows under its name.
 */
import { type ReactNode, useState } from "react";
import { View } from "react-native";

import { ChoiceChip } from "../ui/choice-chip";
import { ListSectionHeader } from "../ui/grouped-list";

export type StudentSection = { value: string; label: string; render: () => ReactNode };

export function StudentSections({ sections }: { sections: StudentSection[] }) {
  const first = sections[0]?.value ?? "";
  const [current, setCurrent] = useState(first);
  const [opened, setOpened] = useState<Set<string>>(() => new Set([first]));
  if (sections.length === 0) return null;
  if (sections.length === 1) {
    const only = sections[0]!;
    return (
      <View>
        <ListSectionHeader>{only.label}</ListSectionHeader>
        {only.render()}
      </View>
    );
  }
  const choose = (value: string) => {
    setCurrent(value);
    setOpened((prev) => (prev.has(value) ? prev : new Set(prev).add(value)));
  };
  return (
    <View className="flex-col gap-3">
      <View accessibilityRole="tablist" className="flex-row flex-wrap gap-2">
        {sections.map((s) => (
          <ChoiceChip key={s.value} label={s.label} selected={current === s.value} onPress={() => choose(s.value)} />
        ))}
      </View>
      {sections.map((s) =>
        opened.has(s.value) ? (
          <View key={s.value} className={current === s.value ? undefined : "hidden"}>
            {s.render()}
          </View>
        ) : null,
      )}
    </View>
  );
}
