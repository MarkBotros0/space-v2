import { useState } from "react";
import { TextInput, View } from "react-native";
import { Search } from "lucide-react-native";

import { useThemeColors } from "../theme/use-theme-colors";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";

iconWithClassName(Search);

/**
 * A filled search box; its `control-border` edge keeps the field 3:1 against
 * the page (R25) and turns to the focus ring while typing (R26). The edge is on
 * the wrapping View, so focus is tracked in state rather than with `focus:`.
 */
function SearchField({
  value, onChangeText, placeholder, className, onSubmitEditing, accessibilityLabel,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  className?: string;
  /** Keyboard search pressed. */
  onSubmitEditing?: () => void;
  /** Defaults to the placeholder. */
  accessibilityLabel?: string;
}) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  return (
    <View
      testID="search-field"
      className={cn("min-h-[44px] flex-row items-center gap-2 rounded-control border border-control-border bg-neutral-soft px-3", focused && "border-ring", className)}
    >
      <Search size={16} className="text-muted-foreground" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors["muted-foreground"]}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        className="min-h-[44px] flex-1 py-0 text-base text-foreground"
      />
    </View>
  );
}

export { SearchField };
