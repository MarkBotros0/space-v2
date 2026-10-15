import type { LucideIcon } from "lucide-react-native";
import { cssInterop } from "nativewind";

/**
 * Lets a lucide icon take `className="text-success-800"` like v1's icons:
 * the resolved text colour becomes the icon's `color` prop. Idempotent, so
 * components that take an icon prop can register it on render.
 */
const registered = new WeakSet<LucideIcon>();

export function iconWithClassName(...icons: LucideIcon[]): void {
  for (const Icon of icons) {
    if (registered.has(Icon)) continue;
    registered.add(Icon);
    cssInterop(Icon, { className: { target: "style", nativeStyleToProp: { color: true } } });
  }
}
