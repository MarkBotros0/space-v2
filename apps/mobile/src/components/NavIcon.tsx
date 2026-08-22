import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

import type { NavIconName } from "@space/shared";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

/**
 * `Record<NavIconName, IoniconName>` rather than a `Partial`/switch: a new
 * `NavIconName` added to `packages/shared/src/navigation.ts` without a
 * corresponding entry here is a compile error, not a blank glyph at runtime.
 */
const GLYPHS: Record<NavIconName, IoniconName> = {
  home: "home",
  dashboard: "grid",
  users: "people",
  calendar: "calendar",
  events: "megaphone",
  assignments: "document-text",
  submissions: "cloud-upload",
  history: "time",
  profile: "person-circle",
  reports: "bar-chart",
  groups: "people-circle",
  season: "leaf",
  students: "school",
  alumni: "ribbon",
  dropped: "person-remove",
  notes: "clipboard",
  quizzes: "help-circle",
  more: "ellipsis-horizontal",
  settings: "settings",
};

export interface NavIconProps {
  name: NavIconName;
  color: string;
  size: number;
}

export function NavIcon({ name, color, size }: NavIconProps) {
  return <Ionicons name={GLYPHS[name]} color={color} size={size} />;
}
