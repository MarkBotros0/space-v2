import type { NavIconName } from "@space/shared";
import {
  Bell,
  Calendar,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  FileText,
  Folders,
  GraduationCap,
  History,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  Notebook,
  PenLine,
  Settings,
  Sparkles,
  User,
  UserCheck,
  UserMinus,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { cssInterop } from "nativewind";

/**
 * v1 src/components/layout/nav-link.tsx iconMap, verbatim. `attendance` and
 * `notifications` are v2 NavIconNames with no v1 entry (v1 has no such nav
 * destinations); CheckCheck and Bell follow v1's attendance/bell visuals.
 */
const ICONS: Record<NavIconName, LucideIcon> = {
  home: Home,
  dashboard: LayoutDashboard,
  users: Users,
  calendar: Calendar,
  events: CalendarDays,
  assignments: ClipboardList,
  attendance: CheckCheck,
  submissions: FileText,
  history: History,
  profile: User,
  reports: FileText,
  groups: Folders,
  season: Sparkles,
  students: GraduationCap,
  alumni: UserCheck,
  dropped: UserMinus,
  notes: Notebook,
  notifications: Bell,
  quizzes: PenLine,
  more: MoreHorizontal,
  settings: Settings,
};

// Lets `className="text-white/55"` colour the icon, as v1's classes do.
for (const Icon of Object.values(ICONS)) {
  cssInterop(Icon, { className: { target: "style", nativeStyleToProp: { color: true } } });
}

export function NavIcon({ name, size = 20, className }: { name: NavIconName; size?: number; className?: string }) {
  const Icon = ICONS[name];
  return <Icon size={size} className={className} strokeWidth={2} />;
}
