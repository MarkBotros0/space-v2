import { useState } from "react";
import { View } from "react-native";

import { Button } from "../../design/ui/button";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { HeroCard } from "../../design/ui/hero-card";
import { SearchField } from "../../design/ui/search-field";
import { SegmentedControl } from "../../design/ui/segmented-control";
import { StatTile } from "../../design/ui/stat-tile";
import { StatusChip } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { CatalogueSection } from "./section";

const LONG_TITLE =
  "A very long row title that keeps going well past the end of the line to prove it truncates";

export function ListSection() {
  return (
    <CatalogueSection id="list" title="Grouped list">
      <GroupedList header="Sessions">
        <ListRow title="Plain row" />
        <ListRow title="With subtitle" subtitle="Tuesday, 6:30 PM" />
        <ListRow title={LONG_TITLE} subtitle="A long title next to a trailing value and a chevron" trailing={<Text variant="body" tabular>12 / 20</Text>} chevron onPress={() => {}} />
        <ListRow title="With chip" subtitle="Group A" trailing={<StatusChip tone="ok" label="Present" />} chevron onPress={() => {}} />
        <ListRow title="Chevron only" chevron onPress={() => {}} />
        <ListRow title="Trailing value" trailing={<Text variant="body" tabular>92%</Text>} />
      </GroupedList>
    </CatalogueSection>
  );
}

export function HeroStatsSections() {
  return (
    <>
      <CatalogueSection id="hero" title="Hero card">
        <HeroCard
          eyebrow="Next session"
          title="Week 6: Reading and discussion for the whole group"
          meta="Tuesday, 6:30 PM, Room 2"
          action={<Button size="sm" onPress={() => {}}>Check in</Button>}
        />
      </CatalogueSection>
      <CatalogueSection id="stats" title="Stat tiles">
        <View testID="catalogue-stat-row" className="flex-row flex-wrap gap-3">
          <StatTile value={92} suffix="%" label="Attendance" />
          <StatTile value={7} label="Open assignments to finish" />
          <StatTile value="3 / 10" label="Quizzes" />
        </View>
      </CatalogueSection>
    </>
  );
}

export function ControlsSection() {
  const [two, setTwo] = useState("a");
  const [four, setFour] = useState("w");
  const [query, setQuery] = useState("");
  return (
    <CatalogueSection id="controls" title="Segmented control and search">
      <SegmentedControl
        options={[{ value: "a", label: "Upcoming" }, { value: "b", label: "Past" }]}
        value={two}
        onChange={setTwo}
      />
      <SegmentedControl
        options={[
          { value: "d", label: "Day" },
          { value: "w", label: "Week" },
          { value: "m", label: "Month" },
          { value: "y", label: "Year" },
        ]}
        value={four}
        onChange={setFour}
      />
      <SearchField value={query} onChangeText={setQuery} placeholder="Search students" />
    </CatalogueSection>
  );
}
