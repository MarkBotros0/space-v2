/**
 * The avatar in Home's title row: a button that opens Profile settings (owner,
 * 2026-11-07: no dropdown; the theme and Sign out live on More, and on
 * Profile for MENTOR). Also the role badge rule the More menu uses.
 */
import { isAlumnus, type UserRole } from "@space/shared";
import { Pressable } from "react-native";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

type RoleColor = "super" | "admin" | "leader" | "mentor" | "student" | "alumni";
export const ROLE_COLOR: Record<UserRole, RoleColor> = {
  SUPER: "super",
  ADMIN: "admin",
  LEADER: "leader",
  MENTOR: "mentor",
  STUDENT: "student",
};

/**
 * The badge naming who is signed in: the role, except that a graduated
 * student (navFor's isAlumnus rule: role stays STUDENT) is ALUMNI.
 */
export function roleBadge(
  role: UserRole,
  graduationYear: number | null | undefined,
): { color: RoleColor; label: string } {
  if (isAlumnus({ role, graduationYear: graduationYear ?? null }))
    return { color: "alumni", label: "ALUMNI" };
  return { color: ROLE_COLOR[role], label: role };
}

export function UserMenu({
  initials,
  avatarUrl,
  onPress,
}: {
  initials: string;
  avatarUrl?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Profile settings"
      hitSlop={4}
      onPress={onPress}
      className="relative flex-row items-center rounded-full p-0.5"
    >
      <Avatar size="md">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="Your photo" /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
    </Pressable>
  );
}
