import type { NavIconName } from "@space/shared";
import {
  Backpack,
  Bell,
  BookUser,
  BookOpen,
  Calendar,
  ChartColumn,
  CircleUserRound,
  ClipboardCheck,
  ClipboardList,
  Ellipsis,
  GraduationCap,
  History,
  Home,
  Inbox,
  Megaphone,
  LayoutDashboard,
  ListTodo,
  ListChecks,
  NotebookPen,
  Flag,
  Settings,
  Ticket,
  UserCheck,
  UserMinus,
  UsersRound,
  type LucideIcon,
} from "lucide-react-native";
import { cssInterop } from "nativewind";

/**
 * The one icon map for navigation destinations. The tab bar (NavLink), the
 * More page rows and every other place that stands for a destination (card
 * headers, empty states, quick links) draw from it, so a concept looks the
 * same wherever it appears. Revised by the owner (2026-11-05; the v1 match is
 * lifted): each destination gets its own icon that says what it opens (v1
 * used FileText for both reports and submissions, Folders for groups,
 * Sparkles for seasons, PenLine for quizzes); GraduationCap is alumni, a
 * Backpack is students; groups are people (UsersRound) and the Community
 * directory a book with a person (BookUser), so the two never look alike. It was
 * a person with a cog until 2026-11-09 (owner): a cog says settings, and the
 * dev user switcher in Home's header draws that one.
 */
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  home: Home,
  dashboard: LayoutDashboard,
  users: BookUser,
  calendar: Calendar,
  events: Ticket,
  assignments: ClipboardList,
  attendance: UserCheck,
  submissions: Inbox,
  history: History,
  profile: CircleUserRound,
  reports: ChartColumn,
  groups: UsersRound,
  season: BookOpen,
  students: Backpack,
  alumni: GraduationCap,
  dropped: UserMinus,
  notes: NotebookPen,
  notifications: Bell,
  quizzes: ListChecks,
  more: Ellipsis,
  settings: Settings,
  todo: ListTodo,
  submitted: ClipboardCheck,
  followUps: Flag,
  announcements: Megaphone,
};

// Lets `className="text-white/55"` colour the icon, as v1's classes do.
for (const Icon of Object.values(NAV_ICONS)) {
  cssInterop(Icon, { className: { target: "style", nativeStyleToProp: { color: true } } });
}

export function NavIcon({ name, size = 20, className }: { name: NavIconName; size?: number; className?: string }) {
  const Icon = NAV_ICONS[name];
  return <Icon size={size} className={className} strokeWidth={2} />;
}
