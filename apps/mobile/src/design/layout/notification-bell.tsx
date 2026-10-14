/**
 * Port of v1 src/components/layout/notification-bell.tsx — same trigger,
 * badge (9+ cap), header, rows, empty state and "View all" footer.
 * Native differences: Base UI Popover → AnchoredPopover (align end, 6px);
 * rows navigate through onSelect (v2 routes by `target`, not v1's `link`);
 * hover states → active:; data comes in as props (wired in the app shell).
 */
import { formatDistanceToNow } from "date-fns";
import { Bell, BellOff } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";

import { AnchoredPopover, useAnchor } from "../lib/anchored-popover";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Button } from "../ui/button";
import { Text } from "../ui/text";

iconWithClassName(Bell, BellOff);

export interface NotificationBellItem {
  id: number;
  title: string;
  body: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
  /** Whether pressing the row goes somewhere (v1: `link` present). */
  linked: boolean;
}

export function NotificationBell({
  items,
  unread,
  onMarkAllRead,
  onViewAll,
  onSelect,
  markingAll = false,
}: {
  items: NotificationBellItem[];
  unread: number;
  onMarkAllRead: () => void;
  onViewAll: () => void;
  onSelect: (item: NotificationBellItem) => void;
  markingAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  const win = useWindowDimensions();
  const close = () => setOpen(false);
  return (
    <>
      <Pressable
        ref={anchor.ref}
        accessibilityRole="button"
        accessibilityLabel={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        onPress={() => {
          anchor.measure();
          setOpen(true);
        }}
        className="relative size-9 items-center justify-center rounded-md active:bg-muted"
      >
        <Bell size={20} className="text-muted-foreground" />
        {unread > 0 ? (
          <View className="absolute right-1 top-1 min-w-4 items-center justify-center rounded-full bg-error-500 px-1">
            <Text className="text-[10px] font-semibold leading-none text-white">{unread > 9 ? "9+" : unread}</Text>
          </View>
        ) : null}
      </Pressable>
      <AnchoredPopover open={open} onClose={close} anchor={anchor.rect} align="end">
        <View
          className="overflow-hidden rounded-md border border-border bg-popover"
          style={{ width: Math.min(320, win.width - 16) }}
        >
          <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
            <Text className="text-sm font-semibold text-popover-foreground">Notifications</Text>
            <Button variant="ghost" size="xs" onPress={onMarkAllRead} disabled={markingAll || unread === 0}>
              Mark all read
            </Button>
          </View>
          <ScrollView className="max-h-80">
            {items.length === 0 ? (
              <View className="flex-col items-center gap-2 px-3 py-8">
                <BellOff size={20} className="text-muted-foreground" />
                <Text className="text-center text-sm text-muted-foreground">No notifications yet.</Text>
              </View>
            ) : (
              items.map((n, i) => (
                <NotificationRow
                  key={n.id}
                  item={n}
                  first={i === 0}
                  onPress={
                    n.linked
                      ? () => {
                          close();
                          onSelect(n);
                        }
                      : undefined
                  }
                />
              ))
            )}
          </ScrollView>
          <View className="items-end border-t border-border px-3 py-2">
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                close();
                onViewAll();
              }}
            >
              <Text className="text-sm font-medium text-brand-teal-700">View all</Text>
            </Pressable>
          </View>
        </View>
      </AnchoredPopover>
    </>
  );
}

function NotificationRow({ item, first, onPress }: { item: NotificationBellItem; first: boolean; onPress?: () => void }) {
  const inner = (
    <View className={cn("flex-col gap-1 px-3 py-2.5", !item.readAt && "bg-info-50", !first && "border-t border-border")}>
      <View className="flex-row items-start gap-2">
        {!item.readAt ? <View className="mt-1.5 size-1.5 shrink-0 rounded-full bg-info-500" /> : null}
        <Text className="flex-1 text-sm font-medium leading-snug text-popover-foreground">{item.title}</Text>
      </View>
      {item.body ? <Text className="text-xs text-muted-foreground">{item.body}</Text> : null}
      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
      </Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} className="active:bg-muted/60">
      {inner}
    </Pressable>
  );
}
