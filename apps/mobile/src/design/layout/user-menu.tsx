/**
 * The avatar in Home's title row: a button that opens Profile (owner,
 * 2026-11-07: no dropdown; the theme, Sign out and Delete account live on
 * More for every role).
 */
import { Pressable } from "react-native";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

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
      accessibilityLabel="Profile"
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
