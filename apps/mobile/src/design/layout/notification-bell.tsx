/**
 * Port of v1 src/components/layout/notification-bell.tsx — same trigger,
 * badge (9+ cap), header, rows, empty state and "View all" footer.
 * Native differences: Base UI Popover → AnchoredPopover (align end, 6px);
 * rows navigate through onSelect (v2 routes by `target`, not v1's `link`);
 * hover states → active:; data comes in as props (wired in the app shell).
 * Redesign: the header and footer actions are small info-tone links on 44dp
 * targets, an unread row takes the unread-soft tint (lighter than the popover
 * in dark, not darker), and the count is white on error-600 (4.8:1).
 */
import { formatDistanceToNow } from "date-fns";
import { Bell, BellOff } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";

import { AnchoredPopover, useAnchor } from "../lib/anchored-popover";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
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
          <View
            testID="bell-count"
            className="absolute right-1 top-1 min-w-4 items-center justify-center rounded-full bg-error-600 px-1"
          >
            <Text className="text-[10px] font-semibold leading-none text-white">{unread > 9 ? "9+" : unread}</Text>
          </View>
        ) : null}
      </Pressable>
      <AnchoredPopover open={open} onClose={close} anchor={anchor.rect} align="end">
        <View
          className="overflow-hidden rounded-md border border-border bg-popover"
          style={{ width: Math.min(320, win.width - 16) }}
        >
          <View className="flex-row items-center justify-between border-b border-border pl-3 pr-1">
            <Text className="text-sm font-semibold text-popover-foreground">Notifications</Text>
            <SmallLink role="button" onPress={onMarkAllRead} disabled={markingAll || unread === 0}>
              Mark all read
            </SmallLink>
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
          <View className="items-end border-t border-border px-1">
            <SmallLink
              role="link"
              onPress={() => {
                close();
                onViewAll();
              }}
            >
              View all
            </SmallLink>
          </View>
        </View>
      </AnchoredPopover>
    </>
  );
}

/**
 * The popover's text actions (Mark all read, View all): small link-style
 * labels in the info tone (4.5:1 on the popover in both themes) on a 44dp
 * target. A disabled one mutes its label.
 */
function SmallLink({
  role,
  onPress,
  disabled = false,
  children,
}: {
  role: "button" | "link";
  onPress: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      className="min-h-[44px] justify-center rounded-md px-2 active:bg-muted"
    >
      <Text className={cn("text-sm font-medium", disabled ? "text-muted-foreground" : "text-info")}>{children}</Text>
    </Pressable>
  );
}

function NotificationRow({ item, first, onPress }: { item: NotificationBellItem; first: boolean; onPress?: () => void }) {
  const inner = (
    <View
      testID={`notification-row-${item.id}`}
      className={cn("flex-col gap-1 px-3 py-2.5", !item.readAt && "bg-unread-soft", !first && "border-t border-border")}
    >
      <View className="flex-row items-start gap-2">
        {!item.readAt ? <View className="mt-1.5 size-1.5 shrink-0 rounded-full bg-info-500" /> : null}
        <Text className="flex-1 text-sm font-medium leading-snug text-popover-foreground">{item.title}</Text>
      </View>
      {item.body ? <Text className="text-xs text-muted-foreground">{item.body}</Text> : null}
      <Text className="text-caption uppercase tracking-wide text-muted-foreground">
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
