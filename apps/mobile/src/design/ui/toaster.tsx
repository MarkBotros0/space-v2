/**
 * Toaster via sonner-native, restyled to the redesign tokens: surface
 * background, separator border, radius 14, popover shadow, foreground title
 * and muted description. richColors and closeButton are kept so success and
 * error toasts stay tinted; position top-center.
 */
import { useColorScheme } from "nativewind";
import { Toaster as SonnerToaster, toast } from "sonner-native";

import { shadowStyle } from "../lib/shadow";
import { useThemeColors } from "../theme/use-theme-colors";

export function Toaster() {
  const { colorScheme } = useColorScheme();
  const colors = useThemeColors();
  return (
    <SonnerToaster
      theme={colorScheme === "dark" ? "dark" : "light"}
      richColors
      closeButton
      position="top-center"
      toastOptions={{
        style: {
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.separator,
          backgroundColor: colors.surface,
          ...shadowStyle("pop"),
        },
        titleStyle: { color: colors.foreground, fontFamily: "Geist_500Medium" },
        descriptionStyle: { color: colors["muted-foreground"], fontFamily: "Geist_400Regular" },
      }}
    />
  );
}

export { toast };
