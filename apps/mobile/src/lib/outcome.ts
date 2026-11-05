import { haptic } from "../design/motion";
import { toast } from "../design/ui/toaster";

/**
 * The result of a student's save or submit. The action sits in a pinned bar and
 * the screen may scroll, swap or be gone by the time the answer lands, so it goes
 * in the global toast with a light haptic rather than in a callout in the body.
 */
export function reportOutcome(kind: "success" | "error", message: string): void {
  haptic("light");
  toast[kind](message);
}
