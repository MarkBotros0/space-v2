import { CalendarPlus, Copy, FolderPlus, Users } from "lucide-react-native";
import { View } from "react-native";

import { FieldCell, FieldRow, FormSection } from "../../design/forms/form-section";
import { ActionGrid } from "../../design/seasons/action-grid";
import { NextStepCard } from "../../design/seasons/next-step-card";
import { StudentsLevel } from "../../design/seasons/students-level";
import { FormField } from "../../design/ui/form-field";
import { Input } from "../../design/ui/input";
import { CatalogueSection } from "./section";

const noop = () => {};

/** The season page's tiles, next-step cards and People card Students level, and the season form's sections. */
export function SeasonPartsSection() {
  return (
    <CatalogueSection id="season-parts" title="Season parts">
      <NextStepCard
        title="This season is a draft"
        body="Nobody sees it until it starts. Set up its groups and people, then start it."
        action={{ label: "Start season", onPress: noop }}
      />
      <NextStepCard
        tone="warn"
        title="The end date has passed"
        body="End the season to record who passed and lock it."
        action={{ label: "End season", onPress: noop }}
      />
      <ActionGrid
        actions={[
          { label: "Students and groups", hint: "Move students between groups", icon: Users, onPress: noop },
          { label: "New group", icon: FolderPlus, onPress: noop },
          { label: "New session", icon: CalendarPlus, onPress: noop },
          { label: "Duplicate season", icon: Copy, onPress: noop },
        ]}
      />
      <View className="gap-4 rounded-group bg-surface p-4">
        <StudentsLevel
          seasonTitle="GBV 2026"
          count={0}
          ungrouped={0}
          groups={1}
          onSelectFromCommunity={noop}
          onInviteNew={noop}
          suggestion={{ title: "GBV 2025", count: 12, onAdd: noop }}
        />
        <StudentsLevel seasonTitle="GBV 2026" count={3} ungrouped={1} groups={1} onSelectFromCommunity={noop} onInviteNew={noop} />
        <StudentsLevel seasonTitle="GBV 2025" count={14} ungrouped={0} groups={2} />
      </View>
      <View className="gap-6">
        <FormSection title="Form section" note="A note under the card.">
          <FieldRow>
            <FieldCell grow={2}>
              <FormField label="Wide field">
                <Input accessibilityLabel="Wide field" value="GBV" onChangeText={noop} />
              </FormField>
            </FieldCell>
            <FieldCell>
              <FormField label="Narrow">
                <Input accessibilityLabel="Narrow field" value="2026" onChangeText={noop} />
              </FormField>
            </FieldCell>
          </FieldRow>
        </FormSection>
      </View>
    </CatalogueSection>
  );
}
