import { TextInput, View } from "react-native";
import { Search } from "lucide-react-native";

import { useThemeColors } from "../theme/use-theme-colors";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";

iconWithClassName(Search);

/** A filled search box; its `control-border` edge keeps the field 3:1 against the page (R25). */
function SearchField({
  value, onChangeText, placeholder, className,
}: { value: string; onChangeText: (text: string) => void; placeholder: string; className?: string }) {
  const colors = useThemeColors();
  return (
    <View testID="search-field" className={cn("min-h-[44px] flex-row items-center gap-2 rounded-xl border border-control-border bg-neutral-soft px-3", className)}>
      <Search size={16} className="text-muted-foreground" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors["muted-foreground"]}
        accessibilityLabel={placeholder}
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
