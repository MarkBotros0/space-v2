import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// font-normal/medium/semibold/bold are custom utilities here (they set the
// Geist face too); tell tailwind-merge they are still one font-weight group.
const twMerge = extendTailwindMerge({
  override: {
    classGroups: {
      "font-weight": [{ font: ["normal", "medium", "semibold", "bold", "extrabold", "black"] }],
    },
  },
  // Redesign type scale: without this text-body etc. read as colours and
  // collide with text-foreground.
  // and the named radii (rounded-group, rounded-control, rounded-t-sheet) must replace rounded-* like any size.
  extend: {
    theme: { radius: ["group", "control", "sheet"] },
    classGroups: { "font-size": [{ text: ["large-title", "title", "headline", "body", "subhead", "caption"] }] },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
