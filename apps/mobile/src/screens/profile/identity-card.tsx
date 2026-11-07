import type { ReactNode } from "react";
import { View } from "react-native";

import { Avatar, AvatarFallback, Text } from "../../design/ui";
import { initialsOf } from "../../lib/initials";

/**
 * The profile hero: initials, name and email, with an optional action (Edit) under
 * them. No role badge (owner, 2026-11-07).
 */
export function IdentityCard({
  name,
  email,
  action,
}: {
  name: string;
  email: string;
  action?: ReactNode;
}) {
  return (
    <View className="rounded-group bg-surface dark:border dark:border-separator p-5">
      <View className="flex-row items-center gap-4">
        {/* Initials only: v2 has no avatar read path and uploads are off (gap note). */}
        <Avatar size="xl" className="shrink-0">
          <AvatarFallback>{initialsOf(name, email.charAt(0).toUpperCase() || "?")}</AvatarFallback>
        </Avatar>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="title" numberOfLines={2} className="text-brand-navy-900 dark:text-foreground">
            {name}
          </Text>
          <Text variant="caption" numberOfLines={1} className="text-muted-foreground">
            {email}
          </Text>
          {action ? <View className="mt-2 flex-row">{action}</View> : null}
        </View>
      </View>
    </View>
  );
}
