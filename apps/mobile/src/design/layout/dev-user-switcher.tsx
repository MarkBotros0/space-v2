/**
 * v1's DevUserSwitcher (jpc-space src/components/dev/dev-user-switcher.tsx):
 * a header button that signs you in as any user, grouped by role, for
 * testing. Renders nothing unless the backend has DEV_USER_SWITCHER=1 (the
 * /dev/users probe answers 404 otherwise). Native: v1's dropdown becomes a
 * sheet with a search, because the list is the whole user table.
 */
import type { DevSwitchUser, UserRole } from "@space/shared";
import { useRouter } from "expo-router";
import { UserCog } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { useDevSwitch, useDevUsers } from "../../hooks/use-dev-switch";
import { useSessionStore } from "../../store/session";
import { iconWithClassName } from "../lib/icon";
import { Badge } from "../ui/badge";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { SearchField } from "../ui/search-field";
import { Sheet } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { Text } from "../ui/text";
import { toast } from "../ui/toaster";

iconWithClassName(UserCog);

const ROLE_ORDER: UserRole[] = ["SUPER", "ADMIN", "LEADER", "MENTOR", "STUDENT"];
const ROLE_COLOR = {
  SUPER: "super",
  ADMIN: "admin",
  LEADER: "leader",
  MENTOR: "mentor",
  STUDENT: "student",
} as const;

export function DevUserSwitcher() {
  const probe = useDevUsers("", true);
  const [open, setOpen] = useState(false);
  if (!probe.data) return null; // off on this backend (or not answered yet)
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch user (dev)"
        onPress={() => setOpen(true)}
        className="size-11 items-center justify-center rounded-md active:bg-muted"
      >
        <UserCog size={20} className="text-muted-foreground" />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="Switch user (dev)">
        {open ? <SwitcherBody onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </>
  );
}

function SwitcherBody({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const currentId = useSessionStore((s) => s.user?.id ?? null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const users = useDevUsers(q);
  const switchUser = useDevSwitch();

  const grouped = useMemo(() => {
    const map = new Map<UserRole, DevSwitchUser[]>(ROLE_ORDER.map((r) => [r, []]));
    for (const u of users.data ?? []) map.get(u.role)?.push(u);
    return ROLE_ORDER.map((role) => [role, map.get(role) ?? []] as const).filter(
      ([, list]) => list.length > 0,
    );
  }, [users.data]);

  const pick = (u: DevSwitchUser) => {
    if (switchUser.isPending || u.id === currentId) return;
    switchUser.mutate(u.id, {
      onSuccess: () => {
        onDone();
        router.replace("/dashboard");
        toast.success(`Signed in as ${u.name || u.email}.`);
      },
      onError: () => toast.error("Couldn't switch user. Try again."),
    });
  };

  return (
    <View className="flex-col gap-3" style={{ maxHeight: 520 }}>
      <View className="flex-row items-center gap-2">
        <Badge variant="warning">DEV</Badge>
        <Text variant="caption" className="flex-1 text-muted-foreground">
          Signs in as the user you pick, with no password.
        </Text>
      </View>
      <SearchField
        value={text}
        onChangeText={setText}
        placeholder="Search name or email"
        accessibilityLabel="Search users"
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        {users.isPending ? (
          <View accessible accessibilityLabel="Loading" className="flex-col gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </View>
        ) : grouped.length === 0 ? (
          <Text className="py-4 text-center text-sm text-muted-foreground">No users match.</Text>
        ) : (
          <View className="flex-col gap-4 pb-4">
            {grouped.map(([role, list]) => (
              <GroupedList key={role} header={role}>
                {list.map((u) => (
                  <ListRow
                    key={u.id}
                    title={u.name || u.email}
                    subtitle={u.email}
                    subtitleLines={1}
                    trailing={
                      u.id === currentId ? <Badge role={ROLE_COLOR[role]}>You</Badge> : undefined
                    }
                    onPress={() => pick(u)}
                  />
                ))}
              </GroupedList>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
