import { useColorScheme } from "nativewind";

const { semantic } = require("./tailwind-theme.js") as {
  semantic: Record<"light" | "dark", Record<string, string>>;
};

export type SemanticColor = keyof (typeof semantic)["light"];

/** v1's resolved semantic colours for the active theme, for colour props. */
export function useThemeColors(): Record<string, string> {
  const { colorScheme } = useColorScheme();
  return semantic[colorScheme === "dark" ? "dark" : "light"];
}
