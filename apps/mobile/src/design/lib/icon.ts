import type { LucideIcon } from "lucide-react-native";
import { cssInterop } from "nativewind";

/**
 * Lets a lucide icon take `className="text-success-800"` like v1's icons:
 * the resolved text colour becomes the icon's `color` prop.
 */
export function iconWithClassName(...icons: LucideIcon[]): void {
  for (const Icon of icons) {
    cssInterop(Icon, { className: { target: "style", nativeStyleToProp: { color: true } } });
  }
}
