import { View } from "react-native";

import { Switch } from "../../design/ui/switch";
import { Text } from "../../design/ui/text";
import { CatalogueSection } from "./section";

const STATES = [
  { label: "Off", checked: false, disabled: false },
  { label: "On", checked: true, disabled: false },
  { label: "Off, disabled", checked: false, disabled: true },
  { label: "On, disabled", checked: true, disabled: true },
];

export function SwitchSection() {
  return (
    <CatalogueSection id="switch" title="Switch">
      {STATES.map((s) => (
        <View key={s.label} className="flex-row items-center justify-between">
          <Text variant="body">{s.label}</Text>
          <Switch accessibilityLabel={s.label} checked={s.checked} disabled={s.disabled} />
        </View>
      ))}
    </CatalogueSection>
  );
}
