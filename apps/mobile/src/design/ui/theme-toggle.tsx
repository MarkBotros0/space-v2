/**
 * Port of v1 src/components/ui/theme-toggle.tsx — one ghost icon button that
 * flips light/dark, with v1's labels. Native differences: the sun/moon
 * rotate-and-fade swap is not animated.
 */
import { Moon, Sun } from "lucide-react-native";

import { iconWithClassName } from "../lib/icon";
import { useThemeMode } from "../theme/theme-mode";
import { Button } from "./button";

iconWithClassName(Moon, Sun);

export function ThemeToggle({ className, size = "icon-sm" }: { className?: string; size?: "icon" | "icon-sm" }) {
  const { resolved, setMode } = useThemeMode();
  const isDark = resolved === "dark";
  return (
    <Button
      variant="ghost"
      size={size}
      accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onPress={() => void setMode(isDark ? "light" : "dark")}
      className={className}
    >
      {isDark ? <Moon size={16} className="text-foreground" /> : <Sun size={16} className="text-foreground" />}
    </Button>
  );
}
