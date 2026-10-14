/**
 * Port of v1 src/components/ui/toaster.tsx (sonner) via sonner-native, with
 * v1's options: richColors, closeButton, and the toast overridden to
 * rounded-xl, border-border, bg-card, text-foreground, shadow-pop.
 * Native differences: position top-right → top-center (sonner already
 * spans the width at phone size); classNames → style objects with the
 * resolved theme colours; Geist via fontFamily.
 */
import { useColorScheme } from "nativewind";
import { Toaster as SonnerToaster, toast } from "sonner-native";

import { shadowStyle } from "../lib/shadow";
import { useThemeColors } from "../theme/use-theme-colors";

const { borderRadius } = require("../theme/tailwind-theme.js") as { borderRadius: Record<string, string> };

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
          borderRadius: parseFloat(borderRadius.xl ?? "14"),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          ...shadowStyle("pop"),
        },
        titleStyle: { color: colors.foreground, fontFamily: "Geist_500Medium" },
        descriptionStyle: { color: colors["muted-foreground"], fontFamily: "Geist_400Regular" },
      }}
    />
  );
}

export { toast };
