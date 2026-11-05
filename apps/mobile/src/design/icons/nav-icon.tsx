import type { NavIconName } from "@space/shared";
import {
  Bell,
  Calendar,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  FileText,
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
  UserCog,
  UserMinus,
  UsersRound,
  type LucideIcon,
} from "lucide-react-native";
import { cssInterop } from "nativewind";

/**
 * The one icon map for navigation destinations: the tab bar (NavLink) and the
 * More page rows both draw from it. Started from v1's nav-link iconMap; the
 * v1 match is lifted (owner, 2026-11-04), so groups are people (UsersRound,
 * not v1's Folders) and admin user management is a person with a cog
 * (UserCog), so the two people icons never sit side by side looking alike.
 */
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  home: Home,
  dashboard: LayoutDashboard,
  users: UserCog,
  calendar: Calendar,
  events: CalendarDays,
  assignments: ClipboardList,
  attendance: CheckCheck,
  submissions: FileText,
  history: History,
  profile: User,
  reports: FileText,
  groups: UsersRound,
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
for (const Icon of Object.values(NAV_ICONS)) {
  cssInterop(Icon, { className: { target: "style", nativeStyleToProp: { color: true } } });
}

export function NavIcon({ name, size = 20, className }: { name: NavIconName; size?: number; className?: string }) {
  const Icon = NAV_ICONS[name];
  return <Icon size={size} className={className} strokeWidth={2} />;
}
