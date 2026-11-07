import { CalendarPlus, Copy, FolderPlus, UserPlus, Users } from "lucide-react-native";
import { View } from "react-native";

import { FieldCell, FieldRow, FormSection } from "../../design/forms/form-section";
import { ActionGrid } from "../../design/seasons/action-grid";
import { NextStepCard } from "../../design/seasons/next-step-card";
import { FormField } from "../../design/ui/form-field";
import { Input } from "../../design/ui/input";
import { CatalogueSection } from "./section";

const noop = () => {};

/** The season page's tiles and next-step cards, and the form sections the season form is built from. */
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
          { label: "Add people", hint: "Students, leaders and admins", icon: UserPlus, onPress: noop },
          { label: "Duplicate season", icon: Copy, onPress: noop },
        ]}
      />
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
