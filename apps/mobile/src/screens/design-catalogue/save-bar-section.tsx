/**
 * The full-screen save bar: "Show save bar" puts a `SaveBar` in the
 * catalogue's own `Screen` footer (pinned outside the scroll view, riding the
 * keyboard), and the field below lets the sweep shoot it with the keyboard
 * up. The bar's Save only hides it: the catalogue never writes.
 */
import { useState } from "react";
import { View } from "react-native";

import { SaveBar } from "../../design/layout/save-bar";
import { Button } from "../../design/ui/button";
import { Input } from "../../design/ui/input";
import { Text } from "../../design/ui/text";
import { CatalogueSection } from "./section";

export function SaveBarSection({
  shown,
  onToggle,
  disabledShown,
  onToggleDisabled,
}: {
  shown: boolean;
  onToggle: () => void;
  disabledShown: boolean;
  onToggleDisabled: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <CatalogueSection id="save-bar" title="Save bar">
      <Text variant="subhead" className="text-muted-foreground">
        A long form's pinned Save, in this screen's footer. The last field scrolls clear of it.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button testID="catalogue-toggle-save-bar" variant="secondary" onPress={onToggle}>
          {shown ? "Hide save bar" : "Show save bar"}
        </Button>
        <Button testID="catalogue-toggle-save-bar-disabled" variant="secondary" onPress={onToggleDisabled}>
          {disabledShown ? "Hide disabled bar" : "Show disabled bar"}
        </Button>
      </View>
      <Text variant="caption" className="text-muted-foreground">
        The disabled bar is `FormScreen disabled`: nothing to save, with the hint saying why.
      </Text>
      <Input
        testID="catalogue-save-bar-input"
        accessibilityLabel="Save bar field"
        placeholder="Last field on the form"
        value={value}
        onChangeText={setValue}
        size="lg"
      />
    </CatalogueSection>
  );
}

/** The catalogue screen's footer while the example is on. */
export function CatalogueSaveBar({ onDone, disabled = false }: { onDone: () => void; disabled?: boolean }) {
  if (disabled) return <SaveBar label="Save changes" hint="Nothing to save yet." disabled onPress={onDone} />;
  return (
    <SaveBar
      label="Save changes"
      hint="Example only: Save hides this bar."
      error="Couldn't save. Check your connection and try again."
      onPress={onDone}
    />
  );
}
