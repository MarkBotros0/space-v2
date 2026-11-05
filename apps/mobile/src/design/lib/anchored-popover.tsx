/**
 * Native stand-in for Base UI's Popover/Select positioner as v1 uses it:
 * the popup opens 6px below its trigger (sideOffset={6}), at least as wide
 * as the trigger when asked (min-w/w-[var(--anchor-width)]), flips above
 * when there is no room below, and closes on an outside press.
 */
import { type ReactNode, useCallback, useRef, useState } from "react";
import { Modal, Platform, Pressable, StatusBar, useWindowDimensions, View, type ViewInstance } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "./cn";
import { shadowStyle } from "./shadow";

type Rect = { x: number; y: number; width: number; height: number };

const SIDE_OFFSET = 6;
const EDGE = 8; // keep popups off the screen edge, like Base UI's collision padding

/**
 * Where a popup of `popupHeight` goes: below the trigger if it fits above the
 * bottom inset, else above it, else shifted up to sit flush on the bottom
 * limit (never under the nav bar), with `maxHeight` when even that is too tall.
 * Sweep K3: a date picker at 360x640 ran under the nav bar and covered Save.
 */
export function popoverVertical(args: {
  anchor: Rect;
  popupHeight: number;
  sideOffset: number;
  winHeight: number;
  insetTop: number;
  insetBottom: number;
}): { top?: number; bottom?: number; maxHeight: number } {
  const { anchor, popupHeight, sideOffset, winHeight, insetTop, insetBottom } = args;
  const topLimit = insetTop + EDGE;
  const bottomLimit = winHeight - insetBottom - EDGE;
  const maxHeight = Math.max(0, bottomLimit - topLimit);
  const below = anchor.y + anchor.height + sideOffset;
  if (below + popupHeight <= bottomLimit) return { top: below, maxHeight };
  if (anchor.y - sideOffset - popupHeight >= topLimit) {
    return { bottom: winHeight - anchor.y + sideOffset, maxHeight };
  }
  return { top: Math.max(topLimit, bottomLimit - popupHeight), maxHeight };
}

/** Ref for the trigger plus a measure() that records its window position. */
export function useAnchor() {
  const ref = useRef<ViewInstance>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const measure = useCallback(() => {
    // On Android, measureInWindow reports y below the status bar while the
    // popover's modal (edge-to-edge) draws from the top of the screen.
    const statusBar = Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
    ref.current?.measureInWindow((x, y, width, height) => setRect({ x, y: y + statusBar, width, height }));
  }, []);
  return { ref, rect, measure };
}

export function AnchoredPopover({
  open,
  onClose,
  anchor,
  width,
  align = "start",
  sideOffset = SIDE_OFFSET,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchor: Rect | null;
  /** "anchor" = exactly the trigger's width, "min-anchor" = at least it, undefined = content width. */
  width?: "anchor" | "min-anchor";
  /** Base UI `align`: "end" lines the popup's right edge up with the trigger's. */
  align?: "start" | "end";
  sideOffset?: number;
  className?: string;
  children: ReactNode;
}) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [popupHeight, setPopupHeight] = useState(0);
  const [popupWidth, setPopupWidth] = useState(0);

  let position: { top?: number; bottom?: number; left: number; maxHeight?: number } = { top: 0, left: EDGE };
  if (anchor) {
    const wanted = align === "end" ? anchor.x + anchor.width - popupWidth : anchor.x;
    const left = Math.max(EDGE, Math.min(wanted, win.width - EDGE - popupWidth));
    position = {
      left,
      ...popoverVertical({
        anchor,
        popupHeight,
        sideOffset,
        winHeight: win.height,
        insetTop: insets.top,
        insetBottom: insets.bottom,
      }),
    };
  }
  const sizing =
    anchor && width === "anchor"
      ? { width: anchor.width }
      : anchor && width === "min-anchor"
        ? { minWidth: anchor.width }
        : undefined;

  return (
    <Modal transparent visible={open} onRequestClose={onClose} statusBarTranslucent animationType="fade">
      <Pressable accessibilityLabel="Dismiss" className="absolute inset-0" onPress={onClose} />
      <View
        onLayout={(e) => {
          setPopupHeight(e.nativeEvent.layout.height);
          setPopupWidth(e.nativeEvent.layout.width);
        }}
        className={cn("absolute", className)}
        style={[position, sizing, { maxWidth: win.width - EDGE * 2 }, shadowStyle("md")]}
      >
        {children}
      </View>
    </Modal>
  );
}
