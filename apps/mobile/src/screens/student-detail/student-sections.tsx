/**
 * The switchable part of a student's page: one segmented control (Submissions,
 * Attendance, Notes, Seasons) over the chosen section (owner, 2026-11-07: the
 * chips wrapped and ran off the edge; a segment shrinks its label to fit
 * instead), and nothing is underlined. A section mounts the first time it is chosen and then stays
 * mounted, hidden, so its cache and scroll state survive a switch (spec 06 §9).
 * With a single section there is nothing to choose: it shows under its name.
 */
import { type ReactNode, useState } from "react";
import { View } from "react-native";

import { ListSectionHeader } from "../../design/ui/grouped-list";
import { SegmentedControl } from "../../design/ui/segmented-control";

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
      <SegmentedControl
        options={sections.map((s) => ({ value: s.value, label: s.label }))}
        value={current}
        onChange={choose}
      />
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
