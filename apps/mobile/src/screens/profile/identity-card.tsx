import { View } from "react-native";

import { Avatar, AvatarFallback, Badge, Text as TextV1 } from "../../design/ui";
import { initialsOf } from "../../lib/initials";

/** The profile hero: initials, name, email and one role badge. */
export function IdentityCard({
  name,
  email,
  badge,
}: {
  name: string;
  email: string;
  badge: string;
}) {
  return (
    <View className="rounded-group bg-surface dark:border dark:border-separator p-5">
      <View className="flex-row items-center gap-4">
        {/* Initials only: v2 has no avatar read path and uploads are off (gap note). */}
        <Avatar size="xl" className="shrink-0">
          <AvatarFallback>{initialsOf(name, email.charAt(0).toUpperCase() || "?")}</AvatarFallback>
        </Avatar>
        <View className="min-w-0 flex-1">
          <TextV1
            numberOfLines={1}
            className="text-xl font-black text-brand-navy-900 dark:text-foreground"
          >
            {name}
          </TextV1>
          <TextV1 numberOfLines={1} className="text-xs text-muted-foreground">
            {email}
          </TextV1>
          <View className="mt-2 flex-row flex-wrap gap-1.5">
            <Badge variant="teal">{badge}</Badge>
          </View>
        </View>
      </View>
    </View>
  );
}
