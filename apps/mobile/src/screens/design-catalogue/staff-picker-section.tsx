/**
 * The staff picker sheet's content in every state: people, an empty list, a
 * search with no match, loading, a load failure, and a refused pick with the
 * server's reason in words. Fake data; nothing is sent.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "../../design/ui/text";
import { StaffPickerBody, type StaffPick } from "../season-people/staff-picker-sheet";
import { CatalogueSection } from "./section";

const PEOPLE: StaffPick[] = [
  { id: 1, name: "Peter Samy", description: "GBV 2025" },
  { id: 2, name: "Nour Hany", description: "GBV 2025" },
  { id: 3, name: "Mina Adel with a long name that has to wrap onto a second line" },
];
const noop = () => {};

const frame = (label: string, node: ReactNode) => (
  <View className="flex-col gap-2">
    <Text variant="caption" className="font-medium text-muted-foreground">
      {label}
    </Text>
    <View className="rounded-group border border-separator p-3">{node}</View>
  </View>
);

export function StaffPickerSection() {
  return (
    <CatalogueSection id="staff-picker" title="Staff picker">
      <View className="flex-col gap-4">
        {frame(
          "People",
          <StaffPickerBody people={PEOPLE} state="ready" query="" onQuery={noop} error={null} onPick={noop} />,
        )}
        {frame(
          "Nobody left",
          <StaffPickerBody people={[]} state="ready" query="" onQuery={noop} error={null} onPick={noop} />,
        )}
        {frame(
          "No match",
          <StaffPickerBody people={[]} state="ready" query="zz" onQuery={noop} error={null} onPick={noop} />,
        )}
        {frame(
          "Loading",
          <StaffPickerBody people={[]} state="loading" query="" onQuery={noop} error={null} onPick={noop} />,
        )}
        {frame(
          "Load failed",
          <StaffPickerBody people={[]} state="error" query="" onQuery={noop} error={null} onPick={noop} />,
        )}
        {frame(
          "Refused",
          <StaffPickerBody
            people={PEOPLE}
            state="ready"
            query=""
            onQuery={noop}
            error="Peter is already leading a group in GBV 2026"
            onPick={noop}
          />,
        )}
      </View>
    </CatalogueSection>
  );
}
