import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// font-normal/medium/semibold/bold are custom utilities here (they set the
// Geist face too); tell tailwind-merge they are still one font-weight group.
const twMerge = extendTailwindMerge({
  override: { classGroups: { "font-weight": [{ font: ["normal", "medium", "semibold", "bold"] }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
